import { Client } from "basic-ftp";
import { enterPassiveModeIPv6 } from "basic-ftp/dist/transfer.js";
import fs from "node:fs";
import path from "node:path";

const HOST = process.env.FTP_SERVER;
const PORT = Number(process.env.FTP_PORT || "21");
const USER = process.env.FTP_USERNAME;
const PASSWORD = process.env.FTP_PASSWORD;
const REMOTE_DIR = (process.env.FTP_REMOTE_DIR || "dev").replace(/^\/+|\/+$/g, "") || "dev";
const LOCAL_DIR = path.resolve(process.env.FTP_LOCAL_DIR || "dist");
const FTP_TIMEOUT_MS = Number(process.env.FTP_TIMEOUT_MS || "30000");
const FTP_MAX_ATTEMPTS = Number(process.env.FTP_MAX_ATTEMPTS || "12");
const FTP_RETRY_DELAY_MS = Number(process.env.FTP_RETRY_DELAY_MS || "1000");

if (!HOST || !USER || !PASSWORD) throw new Error("Missing FTP connection environment variables");
if (!fs.existsSync(LOCAL_DIR)) throw new Error(`Local build folder not found: ${LOCAL_DIR}`);
if (!Number.isFinite(FTP_TIMEOUT_MS) || FTP_TIMEOUT_MS <= 0) throw new Error("FTP_TIMEOUT_MS must be positive");
if (!Number.isInteger(FTP_MAX_ATTEMPTS) || FTP_MAX_ATTEMPTS <= 0) throw new Error("FTP_MAX_ATTEMPTS must be a positive integer");
if (!Number.isFinite(FTP_RETRY_DELAY_MS) || FTP_RETRY_DELAY_MS < 0) throw new Error("FTP_RETRY_DELAY_MS must not be negative");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function listLocalFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listLocalFiles(fullPath) : [fullPath];
  });
}

function isTransientFtpError(error) {
  const code = Number(error?.code);
  if ([421, 425, 426, 450, 451, 452].includes(code)) return true;

  const systemCode = String(error?.code || "").toUpperCase();
  if (["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE", "ENETDOWN", "ENETRESET", "ENETUNREACH", "EHOSTUNREACH", "EAI_AGAIN"].includes(systemCode)) {
    return true;
  }

  const message = String(error?.message || error).toLowerCase();
  return ["timeout", "timed out", "control socket", "socket closed", "connection closed", "connection reset", "broken pipe", "fin packet"].some((fragment) => message.includes(fragment));
}

let client;
let deployRoot;

async function connect(attempt) {
  client?.close();
  client = new Client(FTP_TIMEOUT_MS);
  client.ftp.verbose = false;
  client.prepareTransfer = enterPassiveModeIPv6;
  await client.access({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    secure: false,
  });
  console.log(`FTP login root (attempt ${attempt}/${FTP_MAX_ATTEMPTS}):`, await client.pwd());
  await client.ensureDir(REMOTE_DIR);
  deployRoot = await client.pwd();
  console.log("Deploy target:", deployRoot);
}

async function reconnectAfter(error, attempt, label) {
  client?.close();
  client = undefined;
  if (attempt === FTP_MAX_ATTEMPTS || !isTransientFtpError(error)) throw error;
  console.warn(`Transient FTP failure during ${label} (attempt ${attempt}): ${error?.message || error}`);
  console.warn(`Reconnecting in ${FTP_RETRY_DELAY_MS} ms`);
  await sleep(FTP_RETRY_DELAY_MS);
}

async function runWithReconnect(label, operation) {
  for (let attempt = 1; attempt <= FTP_MAX_ATTEMPTS; attempt += 1) {
    try {
      if (!client) await connect(attempt);
      return await operation();
    } catch (error) {
      await reconnectAfter(error, attempt, label);
    }
  }
}

async function uploadFile(localPath) {
  const relativePath = path.relative(LOCAL_DIR, localPath).split(path.sep).join("/");
  const remoteParent = path.posix.dirname(relativePath);
  const remoteName = path.posix.basename(relativePath);
  const localSize = fs.statSync(localPath).size;
  let shouldResume = false;

  for (let attempt = 1; attempt <= FTP_MAX_ATTEMPTS; attempt += 1) {
    try {
      if (!client) await connect(attempt);
      await client.cd(deployRoot);
      if (remoteParent !== ".") await client.ensureDir(remoteParent);

      if (shouldResume) {
        let remoteSize = 0;
        try {
          remoteSize = await client.size(remoteName);
        } catch (error) {
          if (!String(error?.message || error).includes("550")) throw error;
        }

        if (remoteSize === localSize) {
          console.log(`Upload already completed before reconnect: ${relativePath}`);
          return;
        }
        if (remoteSize > 0 && remoteSize < localSize) {
          await client.appendFrom(localPath, remoteName, { localStart: remoteSize });
          console.log(`Resumed upload: ${relativePath}`);
          return;
        }
      }

      await client.uploadFrom(localPath, remoteName);
      console.log(`Uploaded: ${relativePath}`);
      return;
    } catch (error) {
      shouldResume = true;
      await reconnectAfter(error, attempt, `upload ${relativePath}`);
    }
  }
}

try {
  await connect(1);

  for (const localPath of listLocalFiles(LOCAL_DIR)) {
    await uploadFile(localPath);
  }
  console.log("Uploaded build directory");

  for (const obsolete of [".user.ini", "api/exercise-media.php"]) {
    const localObsolete = path.join(LOCAL_DIR, ...obsolete.split("/"));
    if (fs.existsSync(localObsolete)) continue;
    await runWithReconnect(`remove ${obsolete}`, async () => {
      await client.cd(deployRoot);
      try {
        await client.remove(obsolete);
        console.log(`Removed obsolete remote file: ${obsolete}`);
      } catch (error) {
        if (!String(error?.message || error).includes("550")) throw error;
      }
    });
  }

  await runWithReconnect("verify index.html", async () => {
    await client.cd(deployRoot);
    const entries = await client.list();
    if (!entries.some((entry) => entry.name === "index.html")) {
      throw new Error("Verification failed: index.html is missing in deploy target");
    }
    const indexSize = await client.size("index.html");
    console.log(`Verified index.html size: ${indexSize} bytes`);
  });
} finally {
  client?.close();
}
