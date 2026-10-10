import { Client } from "basic-ftp";
import {
  enterPassiveModeIPv4_forceControlHostIP,
  enterPassiveModeIPv6,
} from "basic-ftp/dist/transfer.js";
import { Readable } from "node:stream";
import fs from "node:fs";

const HOST = process.env.FTP_SERVER;
const PORT = Number(process.env.FTP_PORT || "21");
const USER = process.env.FTP_USERNAME;
const PASSWORD = process.env.FTP_PASSWORD;
const REMOTE_DIR = (process.env.FTP_REMOTE_DIR || "").replace(/^\/+|\/+$/g, "");
const TIMEOUT_MS = Number(process.env.FTP_SMOKE_TIMEOUT_MS || "15000");

if (!HOST || !USER || !PASSWORD || !REMOTE_DIR) {
  throw new Error("Missing FTP smoke-test environment variables");
}

async function testMode(label, prepareTransfer) {
  const client = new Client(TIMEOUT_MS);
  client.prepareTransfer = prepareTransfer;
  const remoteName = `.codex-ftp-smoke-${label.toLowerCase()}-${Date.now()}.txt`;

  try {
    await client.access({ host: HOST, port: PORT, user: USER, password: PASSWORD, secure: false });
    await client.cd(REMOTE_DIR);
    const startedAt = Date.now();
    await client.uploadFrom(Readable.from(`ANDREWAY Fit FTP ${label} smoke\n`), remoteName);
    const remoteSize = await client.size(remoteName);
    await client.remove(remoteName);
    console.log(`${label}: PASS (${remoteSize} bytes, ${Date.now() - startedAt} ms), temporary file removed`);
    return true;
  } catch (error) {
    console.log(`${label}: FAIL (${error?.code || "no-code"}) ${error?.message || error}`);
    try {
      await client.remove(remoteName);
      console.log(`${label}: temporary file removed during cleanup`);
    } catch {}
    return false;
  } finally {
    client.close();
  }
}

async function testFileOverwrite() {
  const client = new Client(TIMEOUT_MS);
  client.prepareTransfer = enterPassiveModeIPv6;
  const remoteName = `.codex-ftp-smoke-overwrite-${Date.now()}.png`;
  const localPath = new URL("../public/apple-touch-icon.png", import.meta.url);

  try {
    await client.access({ host: HOST, port: PORT, user: USER, password: PASSWORD, secure: false });
    await client.cd(REMOTE_DIR);
    await client.uploadFrom(fs.createReadStream(localPath), remoteName);
    console.log(`EPSV file create: PASS (${await client.size(remoteName)} bytes)`);
    const startedAt = Date.now();
    await client.uploadFrom(fs.createReadStream(localPath), remoteName);
    console.log(`EPSV file overwrite: PASS (${Date.now() - startedAt} ms)`);
    await client.remove(remoteName);
    console.log("EPSV file overwrite: temporary file removed");
    return true;
  } catch (error) {
    console.log(`EPSV file overwrite: FAIL (${error?.code || "no-code"}) ${error?.message || error}`);
    try { await client.remove(remoteName); } catch {}
    return false;
  } finally {
    client.close();
  }
}

async function testEpsvRetry() {
  const remoteName = `.codex-ftp-smoke-retry-${Date.now()}.png`;
  const localPath = new URL("../public/apple-touch-icon.png", import.meta.url);
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const client = new Client(TIMEOUT_MS);
    client.prepareTransfer = enterPassiveModeIPv6;
    try {
      await client.access({ host: HOST, port: PORT, user: USER, password: PASSWORD, secure: false });
      await client.cd(REMOTE_DIR);
      await client.uploadFrom(fs.createReadStream(localPath), remoteName);
      await client.remove(remoteName);
      console.log(`EPSV retry smoke: PASS on attempt ${attempt}, temporary file removed`);
      return true;
    } catch (error) {
      console.log(`EPSV retry smoke: attempt ${attempt} failed: ${error?.message || error}`);
    } finally {
      client.close();
    }
  }
  return false;
}

const epsvPassed = await testMode("EPSV", enterPassiveModeIPv6);
const pasvPassed = await testMode("PASV", enterPassiveModeIPv4_forceControlHostIP);
const overwritePassed = await testFileOverwrite();
const retryPassed = await testEpsvRetry();

console.log(`Result: EPSV=${epsvPassed ? "PASS" : "FAIL"}, PASV=${pasvPassed ? "PASS" : "FAIL"}, EPSV_OVERWRITE=${overwritePassed ? "PASS" : "FAIL"}, EPSV_RETRY=${retryPassed ? "PASS" : "FAIL"}`);
if (!retryPassed) process.exitCode = 1;
