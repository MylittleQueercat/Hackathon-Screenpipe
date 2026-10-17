"""`wfeval pack <run or snapshot dir> [-o file.zip]`: a zip to send a teammate, without
anyone's login.

A run folder keeps the engine's home (`home/`: the cloud session in store.bin and Pi's
auth.json, Pi and Bun's caches) and scratch (`tmp/`); grading needs neither, so both stay
out. A snapshot's saved states keep store.bin, which older snapshots saved with the login
(stage.LOGIN): it is packed without it. Every packed file is then scanned for session
tokens, API keys and the account's email, and the zip is refused if one is left.
Unpack in the teammate's eval/: `unzip <file>.zip`.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

from .engine import TEMPLATE
from .stage import LOGIN

SKIP_TOP = {"home", "tmp"}
SKIP_NAMES = {".DS_Store", "__pycache__"}
SECRETS = re.compile(rb"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}"  # a JWT
                     rb"|sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{32,}")


def account_email() -> bytes | None:
    store = TEMPLATE / "home/.screenpipe/store.bin"
    try:
        email = json.loads(store.read_text())["settings"]["user"]["email"]
    except (OSError, KeyError, TypeError, ValueError):
        return None
    return email.encode() if email else None


def without_login(data: bytes) -> bytes:
    store = json.loads(data)
    settings = store.get("settings") or {}
    for k in LOGIN:
        settings.pop(k, None)
    return json.dumps(store, indent=2).encode()


def files(src: Path):
    for p in sorted(src.rglob("*")):
        rel = p.relative_to(src)
        if p.is_file() and rel.parts[0] not in SKIP_TOP and not SKIP_NAMES & set(rel.parts):
            yield p, rel


def pack(src: Path, out: Path) -> int:
    src = src.resolve()
    kind = src.parent.name if src.parent.name in ("runs", "snapshots") else "runs"
    email = account_email()
    found = []
    tmp = out.with_suffix(".zip.part")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for p, rel in files(src):
            data = p.read_bytes()
            if p.name == "store.bin":
                data = without_login(data)
            if SECRETS.search(data) or (email and email in data):
                found.append(str(rel))
            z.writestr(f"{kind}/{src.name}/{rel}", data)
    if found:
        tmp.unlink()
        print("refused: a login or key is still in " + ", ".join(found[:10]), file=sys.stderr)
        return 1
    tmp.rename(out)
    print(f"{out} ({out.stat().st_size / 1e6:.1f} MB): unpack in eval/ with `unzip {out.name}`")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="wfeval pack")
    ap.add_argument("dir", type=Path, help="runs/<id> or snapshots/<id>")
    ap.add_argument("-o", "--out", type=Path)
    a = ap.parse_args(argv)
    if not a.dir.is_dir():
        print(f"{a.dir}: no such folder", file=sys.stderr)
        return 1
    return pack(a.dir, a.out or Path.cwd() / f"{a.dir.resolve().name}.zip")
