import { Client } from "basic-ftp";
import fs from "node:fs";
import path from "node:path";

const HOST = process.env.FTP_SERVER;
const PORT = Number(process.env.FTP_PORT || "21");
const USER = process.env.FTP_USERNAME;
const PASSWORD = process.env.FTP_PASSWORD;
const REMOTE_DIR = (process.env.FTP_REMOTE_DIR || "dev").replace(/^\/+|\/+$/g, "") || "dev";
const LOCAL_DIR = path.resolve(process.env.FTP_LOCAL_DIR || "dist");

if (!HOST || !USER || !PASSWORD) throw new Error("Missing FTP connection environment variables");
if (!fs.existsSync(LOCAL_DIR)) throw new Error(`Local build folder not found: ${LOCAL_DIR}`);

const client = new Client(30000);
client.ftp.verbose = false;

try {
  await client.access({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    secure: false,
  });

  console.log("FTP login root:", await client.pwd());
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
