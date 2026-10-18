#!/usr/bin/env python3
"""Download a generated decor still, strip the generator's bottom watermark strip, centre-crop to 9:16.

usage: fetch_decor.py <asset_id> <url>
writes assets/decor/<asset_id>.jpg (about 1060x1884) and prints 'ok <asset_id> <w>x<h>'
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "assets" / "decor"


def main() -> None:
    asset, url = sys.argv[1], sys.argv[2]
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / "raw.jpg"
        subprocess.run(["curl", "-sS", "-f", "-m", "90", "--retry", "3", "-o", str(raw), url], check=True)
        im = Image.open(raw).convert("RGB")
        w, h = im.size
        h2 = int(h * 0.92)                      # the "AI generated" strip sits in the bottom ~4 %
        w2 = int(h2 * 9 / 16)
        if w2 > w:                               # unexpected aspect: fall back to centre crop on height
            w2, h2 = w, int(w * 16 / 9)
        x0 = (w - w2) // 2
        im = im.crop((x0, 0, x0 + w2, h2))
        tmp = OUT / f".{asset}.tmp.jpg"
        im.save(tmp, quality=93, subsampling=0)
        tmp.replace(OUT / f"{asset}.jpg")
    print(f"ok {asset} {im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    main()
