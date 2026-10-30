#!/usr/bin/env python3
"""Stamp sw.js with a release id and SHA-256 fingerprints for public assets."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SW = ROOT / "sw.js"
FILES_RE = re.compile(r"const FILES = /\*FILES\*/.*?/\*END\*/;", re.DOTALL)
VERSION_RE = re.compile(r'const VERSION = /\*VERSION\*/".*?"/\*END\*/;')
EXCLUDED_TOP_LEVEL = {".git", "tools"}
EXCLUDED_FILES = {"README.md", "sw.js"}


def git_revision() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short=7", "HEAD"], cwd=ROOT, text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "local"


def public_assets() -> dict[str, str]:
    assets: dict[str, str] = {}
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT)
        if any(part.startswith(".") or part in EXCLUDED_TOP_LEVEL for part in rel.parts):
            continue
        if rel.as_posix() in EXCLUDED_FILES:
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()[:10]
        assets[rel.as_posix()] = digest
    if not assets:
        raise SystemExit("No public assets found; refusing to stamp an empty cache manifest.")
    return assets


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", help="Explicit release id; default is UTC timestamp plus current git revision.")
    args = parser.parse_args()

    source = SW.read_text(encoding="utf-8")
    if not FILES_RE.search(source) or not VERSION_RE.search(source):
        raise SystemExit("sw.js is missing the expected FILES or VERSION markers.")

    version = args.version or f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{git_revision()}"
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", version):
        raise SystemExit("Release id may contain only letters, numbers, dots, underscores, and hyphens.")

    files_json = json.dumps(public_assets(), ensure_ascii=False, separators=(",", ":"))
    source = FILES_RE.sub(f"const FILES = /*FILES*/{files_json}/*END*/;", source, count=1)
    source = VERSION_RE.sub(f'const VERSION = /*VERSION*/"{version}"/*END*/;', source, count=1)
    SW.write_text(source, encoding="utf-8")
    print(f"Stamped {len(json.loads(files_json))} assets for release {version}.")


if __name__ == "__main__":
    main()
