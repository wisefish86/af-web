import { Client } from "basic-ftp";
import fs from "node:fs";
import path from "node:path";

const HOST = process.env.FTP_SERVER;
const PORT = Number(process.env.FTP_PORT || "21");
const USER = process.env.FTP_USERNAME;
const PASSWORD = process.env.FTP_PASSWORD;
const REMOTE_DIR = (process.env.FTP_REMOTE_DIR || "dev").replace(/^\/+|\/+$/g, "") || "dev";
const LOCAL_DIR = path.resolve(process.env.FTP_LOCAL_DIR || "dist");
const FTP_TIMEOUT_MS = Number(process.env.FTP_TIMEOUT_MS || "1800000");
const FTP_MAX_ATTEMPTS = Number(process.env.FTP_MAX_ATTEMPTS || "3");
const FTP_RETRY_DELAY_MS = Number(process.env.FTP_RETRY_DELAY_MS || "15000");

if (!HOST || !USER || !PASSWORD) throw new Error("Missing FTP connection environment variables");
if (!fs.existsSync(LOCAL_DIR)) throw new Error(`Local build folder not found: ${LOCAL_DIR}`);
if (!Number.isFinite(FTP_TIMEOUT_MS) || FTP_TIMEOUT_MS <= 0) throw new Error("FTP_TIMEOUT_MS must be positive");
if (!Number.isInteger(FTP_MAX_ATTEMPTS) || FTP_MAX_ATTEMPTS <= 0) throw new Error("FTP_MAX_ATTEMPTS must be a positive integer");
if (!Number.isFinite(FTP_RETRY_DELAY_MS) || FTP_RETRY_DELAY_MS < 0) throw new Error("FTP_RETRY_DELAY_MS must not be negative");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientFtpError(error) {
  const code = Number(error?.code);
  if ([421, 425, 426, 450, 451, 452].includes(code)) return true;

  const systemCode = String(error?.code || "").toUpperCase();
  if (["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE", "ENETDOWN", "ENETRESET", "ENETUNREACH", "EHOSTUNREACH", "EAI_AGAIN"].includes(systemCode)) {
    return true;
  }

  const message = String(error?.message || error).toLowerCase();
  return ["timeout", "timed out", "control socket", "socket closed", "connection closed", "connection reset", "broken pipe"].some((fragment) => message.includes(fragment));
}

async function deployOnce(attempt) {
  const client = new Client(FTP_TIMEOUT_MS);
  client.ftp.verbose = false;

  try {
    await client.access({
      host: HOST,
      port: PORT,
      user: USER,
      password: PASSWORD,
      secure: false,
    });

    console.log(`FTP login root (attempt ${attempt}/${FTP_MAX_ATTEMPTS}):`, await client.pwd());
    await client.ensureDir(REMOTE_DIR);
    console.log("Deploy target:", await client.pwd());

    await client.uploadFromDir(LOCAL_DIR);
    console.log("Uploaded build directory");

    for (const obsolete of [".user.ini", "api/exercise-media.php"]) {
      const localObsolete = path.join(LOCAL_DIR, ...obsolete.split("/"));
      if (fs.existsSync(localObsolete)) continue;
      try {
        await client.remove(obsolete);
        console.log(`Removed obsolete remote file: ${obsolete}`);
      } catch (err) {
        const message = String(err?.message || err);
        if (!message.includes("550")) throw err;
      }
    }

    const entries = await client.list();
    if (!entries.some((entry) => entry.name === "index.html")) {
      throw new Error("Verification failed: index.html is missing in deploy target");
    }

    const indexSize = await client.size("index.html");
    console.log(`Verified index.html size: ${indexSize} bytes`);
  } finally {
    client.close();
  }
}

for (let attempt = 1; attempt <= FTP_MAX_ATTEMPTS; attempt += 1) {
  try {
    await deployOnce(attempt);
    break;
  } catch (error) {
    if (attempt === FTP_MAX_ATTEMPTS || !isTransientFtpError(error)) throw error;

    console.warn(`Transient FTP failure on attempt ${attempt}: ${error?.message || error}`);
    console.warn(`Reconnecting and retrying the same deploy in ${FTP_RETRY_DELAY_MS} ms`);
    await sleep(FTP_RETRY_DELAY_MS);
  }
}
