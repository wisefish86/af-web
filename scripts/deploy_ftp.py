from __future__ import annotations

import ftplib
import os
from pathlib import Path

HOST = os.environ["FTP_SERVER"]
PORT = int(os.environ.get("FTP_PORT", "21"))
USERNAME = os.environ["FTP_USERNAME"]
PASSWORD = os.environ["FTP_PASSWORD"]
REMOTE_DIR = os.environ.get("FTP_REMOTE_DIR", "dev").strip("/") or "dev"
LOCAL_DIR = Path(os.environ.get("FTP_LOCAL_DIR", "dist")).resolve()


def ensure_dir(ftp: ftplib.FTP, path: str) -> None:
    for part in [p for p in path.split("/") if p]:
        try:
            ftp.cwd(part)
        except ftplib.error_perm:
            ftp.mkd(part)
            ftp.cwd(part)


def upload_tree(ftp: ftplib.FTP, local_root: Path) -> int:
    count = 0
    for path in sorted(local_root.rglob("*")):
        rel = path.relative_to(local_root)
        if path.is_dir():
            current = ftp.pwd()
            ensure_dir(ftp, rel.as_posix())
            ftp.cwd(current)
            continue

        parent = rel.parent.as_posix()
        current = ftp.pwd()
        if parent != ".":
            ensure_dir(ftp, parent)

        with path.open("rb") as handle:
            ftp.storbinary(f"STOR {path.name}", handle)

        count += 1
        ftp.cwd(current)
    return count


if not LOCAL_DIR.exists():
    raise SystemExit(f"Local build folder not found: {LOCAL_DIR}")

with ftplib.FTP() as ftp:
    ftp.connect(HOST, PORT, timeout=30)
    ftp.login(USERNAME, PASSWORD)
    ftp.set_pasv(True)

    root = ftp.pwd()
    print(f"FTP login root: {root}")
    print(f"FTP root entries before deploy: {ftp.nlst()}")

    ensure_dir(ftp, REMOTE_DIR)
    target = ftp.pwd()
    print(f"Deploy target: {target}")

    uploaded = upload_tree(ftp, LOCAL_DIR)
    print(f"Uploaded files: {uploaded}")

    ftp.cwd(target)
    entries = ftp.nlst()
    print(f"Target entries after deploy: {entries}")

    if "index.html" not in entries:
        raise SystemExit("Verification failed: index.html is missing in deploy target")

    size = ftp.size("index.html")
    print(f"Verified index.html size: {size} bytes")
