#!/usr/bin/env python3
"""Fail closed when repository content contains obvious secrets or private contact data.

Use --worktree in CI before every merge. Use --history immediately before making
this repository public and after any history rewrite.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

MAX_BLOB_BYTES = 2_000_000

PATTERNS = {
    "telegram_bot_token": re.compile(rb"\b\d{7,12}:[A-Za-z0-9_-]{30,}\b"),
    "github_token": re.compile(rb"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "supabase_secret_key": re.compile(rb"\bsb_secret_[A-Za-z0-9_-]{10,}\b"),
    "jwt": re.compile(rb"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b"),
    "private_key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "aws_access_key": re.compile(rb"\bAKIA[0-9A-Z]{16}\b"),
    "basic_auth_url": re.compile(rb"https?://[^/\s:@]+:[^/\s@]+@"),
    "russian_phone": re.compile(rb"\+7\d{10}\b"),
    "email": re.compile(rb"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
}

EMAIL_ALLOWLIST = (
    b"@example.com",
    b"@example.org",
    b"@example.net",
    b"@users.noreply.github.com",
)

TEXT_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".sql", ".yml", ".yaml",
    ".json", ".md", ".txt", ".html", ".css", ".scss", ".toml", ".ini", ".sh", ".ps1",
    ".env", ".example",
}

def should_scan_path(path: str) -> bool:
    name = Path(path).name.lower()
    if name == ".env.example":
        return True
    if name.startswith(".env"):
        return True
    return Path(path).suffix.lower() in TEXT_SUFFIXES

def scan_bytes(path: str, data: bytes) -> list[tuple[str, int]]:
    findings: list[tuple[str, int]] = []
    if Path(path).name.lower().startswith(".env") and Path(path).name.lower() != ".env.example":
        findings.append(("tracked_env_file", 1))

    for kind, pattern in PATTERNS.items():
        for match in pattern.finditer(data):
            if kind == "email" and any(match.group(0).lower().endswith(v) for v in EMAIL_ALLOWLIST):
                continue
            line = data.count(b"\n", 0, match.start()) + 1
            findings.append((kind, line))
    return findings

def run(*args: str) -> bytes:
    return subprocess.check_output(args, stderr=subprocess.DEVNULL)

def worktree_files() -> list[tuple[str, bytes]]:
    files = run("git", "ls-files", "-z").split(b"\0")
    out: list[tuple[str, bytes]] = []
    for raw in files:
        if not raw:
            continue
        path = raw.decode("utf-8", "replace")
        if not should_scan_path(path):
            continue
        p = Path(path)
        try:
            if p.stat().st_size > MAX_BLOB_BYTES:
                continue
            out.append((path, p.read_bytes()))
        except OSError:
            continue
    return out

def history_files() -> list[tuple[str, bytes]]:
    objects = run("git", "rev-list", "--objects", "--all").splitlines()
    seen: set[str] = set()
    out: list[tuple[str, bytes]] = []
    for raw in objects:
        parts = raw.decode("utf-8", "replace").split(" ", 1)
        if len(parts) != 2:
            continue
        sha, path = parts
        if sha in seen or not should_scan_path(path):
            continue
        seen.add(sha)
        try:
            if run("git", "cat-file", "-t", sha).strip() != b"blob":
                continue
            size = int(run("git", "cat-file", "-s", sha).strip())
            if size > MAX_BLOB_BYTES:
                continue
            out.append((path, run("git", "cat-file", "blob", sha)))
        except (subprocess.CalledProcessError, ValueError):
            continue
    return out

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", action="store_true")
    parser.add_argument("--worktree", action="store_true")
    args = parser.parse_args()
    if args.history == args.worktree:
        parser.error("choose exactly one of --worktree or --history")

    files = history_files() if args.history else worktree_files()
    findings: list[tuple[str, str, int]] = []
    for path, data in files:
        for kind, line in scan_bytes(path, data):
            findings.append((path, kind, line))

    if findings:
        print("Public-repository audit found sensitive-looking content:", file=sys.stderr)
        for path, kind, line in findings:
            print(f"  {path}:{line} [{kind}]", file=sys.stderr)
        return 1

    mode = "history" if args.history else "worktree"
    print(f"Public-repository audit passed ({mode}, {len(files)} text blobs/files scanned).")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
