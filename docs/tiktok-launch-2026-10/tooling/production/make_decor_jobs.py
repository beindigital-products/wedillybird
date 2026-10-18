#!/usr/bin/env python3
"""List DECOR assets that still have no image and write them as job batches.

usage: make_decor_jobs.py [--batches 4] [--glob 'D*.json'] [--out decor_jobs]
Each batch file is a JSON list of {"asset": id, "prompt": text}. Existing assets/decor/<id>.jpg are skipped.
"""
import argparse
import glob
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts" if (ROOT / "scripts").is_dir() else ROOT.parent / "scripts"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batches", type=int, default=4)
    ap.add_argument("--glob", default="D*.json")
    ap.add_argument("--out", default=str(ROOT / "decor_jobs"))
    ap.add_argument("--prefix", default="batch")
    a = ap.parse_args()
    jobs, seen = [], set()
    for f in sorted(glob.glob(str(SCRIPTS / a.glob))):
        j = json.load(open(f))
        for b in j["beats"]:
            for v in (b["visual"] if isinstance(b["visual"], list) else [b["visual"]]):
                if v["kind"] == "DECOR" and v["asset"] not in seen:
                    seen.add(v["asset"])
                    if not (ROOT / "assets" / "decor" / f"{v['asset']}.jpg").exists():
                        jobs.append({"asset": v["asset"], "prompt": v["prompt"]})
    out = Path(a.out)
    out.mkdir(exist_ok=True)
    n = max(1, min(a.batches, len(jobs)))
    for i in range(n):
        part = jobs[i::n]
        (out / f"{a.prefix}_{i + 1}.json").write_text(json.dumps(part, indent=1))
        print(f"{a.prefix}_{i + 1}.json: {len(part)} jobs")
    print(f"total {len(jobs)} jobs (~${len(jobs) * 0.035:.2f})")


if __name__ == "__main__":
    main()
