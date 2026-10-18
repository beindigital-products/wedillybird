#!/usr/bin/env python3
"""Build registry.json from what exists on disk.

SCREEN  : fixed catalog of real product captures (segment start `ss` and length `dur` in seconds).
DECOR   : assets/decor/<asset_id>.jpg|png            -> still
NORAH   : assets/norah/<asset>.mp4                   -> clip (e.g. L1-S1.mp4); optional
PLACEHOLDER : stand-in stills for NORAH beats when no footage exists yet (pilot / preview mode)

usage: build_registry.py [--out registry.json]
"""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "product" / "raw"

# Segments picked from the timestamped contact sheets (assets/product/sheets/*.png).
SCREEN = {
    "S01": ("demo_seal_open.mp4", 0.9, 8.0),   # envelope opens, card rises, "Dear Sam, ..."
    "S03": ("demo_rsvp.mp4", 8.2, 4.2),        # countdown, date, venue
    "S04": ("demo_rsvp.mp4", 12.2, 7.6),       # reply form: I'll be there / Maybe / I can't make it, plus-ones, dietary, note, send
    "S06": ("s06_hub.mp4", 4.2, 4.6),          # event hub: real-time RSVP counters, guests card
    "S07": ("s07_guests.mp4", 0.8, 10.5),      # invitation list with statuses
    "S08": ("s08_seating.mp4", 0.8, 15.5),     # seating plan: tables, drag and drop
    "S09": ("s09_checkin.mp4", 0.8, 10.0),     # check-in, online part only (no offline footage)
    "S10": ("s10_gallery.mp4", 0.5, 8.8),      # shared gallery moderation
    "S11": ("s11_cockpit.mp4", 0.8, 4.2),      # planner dashboard KPIs, before "Plan usage"
    "S12": ("s12_crm.mp4", 0.8, 9.8),          # clients table then pipeline
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "production" / "registry.json"))
    a = ap.parse_args()
    reg: dict = {"SCREEN": {}, "TAKES": {}, "DECOR": {}, "NORAH": {}, "PLACEHOLDER": []}
    for mp in sorted((ROOT / "assets" / "product" / "takes").glob("*.marks.json")):
        name = mp.name.removesuffix(".marks.json")
        vid = mp.with_name(f"{name}.mp4")
        if vid.exists():
            d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(vid)],
                                     capture_output=True, text=True).stdout or 0)
            reg["TAKES"][name] = {"file": str(vid), "marks": json.loads(mp.read_text()), "dur": round(d, 2)}
    for sid, (f, ss, dur) in SCREEN.items():
        p = RAW / f
        if p.exists():
            reg["SCREEN"][sid] = {"file": str(p), "frame": "phone", "ss": ss, "dur": dur}
    for p in sorted((ROOT / "assets" / "decor").glob("*")):
        if p.suffix.lower() in (".jpg", ".jpeg", ".png"):
            reg["DECOR"][p.stem] = {"file": str(p), "type": "still"}
    for p in sorted((ROOT / "assets" / "norah").glob("*.mp4")):
        reg["NORAH"][p.stem] = {"file": str(p)}
    reg["PLACEHOLDER"] = [str(p) for p in sorted((ROOT / "assets" / "gallery").glob("g*.jpg"))]
    Path(a.out).write_text(json.dumps(reg, indent=1))
    print(f"registry: {len(reg['TAKES'])} takes, {len(reg['SCREEN'])} screens, {len(reg['DECOR'])} decor, {len(reg['NORAH'])} norah, "
          f"{len(reg['PLACEHOLDER'])} placeholders -> {a.out}")


if __name__ == "__main__":
    main()
