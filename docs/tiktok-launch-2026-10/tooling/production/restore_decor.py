#!/usr/bin/env python3
"""Download again the decor stills listed in decor-manifest.json (studio URLs) into assets/decor.

usage: restore_decor.py [manifest.json]   (default: ../decor-manifest.json next to the plan, or ./decor-manifest.json)
Skips assets that already exist. The studio keeps the files, so this costs nothing.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
default = next((p for p in (ROOT / "decor-manifest.json", ROOT.parent / "decor-manifest.json") if p.exists()), None)
manifest = Path(sys.argv[1]) if len(sys.argv) > 1 else default
if manifest is None:
    raise SystemExit("decor-manifest.json not found")
assets = json.loads(manifest.read_text())["assets"]
ok = skipped = failed = 0
for asset, info in assets.items():
    if (ROOT / "assets" / "decor" / f"{asset}.jpg").exists():
        skipped += 1
        continue
    if not info.get("url"):
        failed += 1
        continue
    r = subprocess.run([sys.executable, str(HERE / "fetch_decor.py"), asset, info["url"]], capture_output=True, text=True)
    ok += r.returncode == 0
    failed += r.returncode != 0
print(f"restored {ok}, already present {skipped}, failed {failed}")
