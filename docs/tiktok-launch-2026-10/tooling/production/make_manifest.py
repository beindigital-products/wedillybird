#!/usr/bin/env python3
"""Script JSON + asset registry -> builder manifest.

usage: make_manifest.py <script.json> <registry.json> <out_manifest.json> --vo <vo.mp3> --words <words.json>
                        [--sub wedillybird.com/en]

registry.json:
{
  "NORAH":  {"L2-S3": {"file": "/abs/path.mp4"}},
  "DECOR":  {"D03-A-d1": {"file": "/abs/path.jpg", "type": "still"}},      # type: still | clip
  "SCREEN": {"S04": {"file": "/abs/path.mp4", "frame": "phone"}}
}
Durations are probed with ffprobe.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

CROPS = {"wide": 1.0, "medium": 1.25, "tight": 1.55, "detail": 1.9}
FOCUS = {"center": [0.5, 0.5], "left": [0.25, 0.5], "right": [0.75, 0.5], "top": [0.5, 0.2],
         "bottom": [0.5, 0.8], "hands": [0.5, 0.78]}
MOTION = {"push-in": "in", "pull-out": "out", "pan-left": "left", "pan-right": "right"}
MUSIC = {"QUIET_LIST": "harmonie", "COPY_PASTE_SEND": "envol", "NOTEBOOK": "aurore", "INSIDE": "jardin"}
OUTRO = {"QUIET_LIST": "Follow for the next Quiet List", "COPY_PASTE_SEND": "Follow for the next copy-paste text",
         "NOTEBOOK": "Follow for the next chapter", "INSIDE": "See it live: link in bio"}


SEQ = {  # default footage per screen id: nth use of that id inside one video -> take:mark(+/-offset)
    "S01": ["g1:seal", "g1:opening", "g1:names"],
    "S03": ["g1:countdown", "g1:details", "g1:names+1.2"],
    "S04": ["g1:rsvp", "g1:yes", "g1:plusone", "g1:send"],
    "S06": ["hub:counters", "hub:reply1+1.0", "hub:reply2+1.0"],
    "S07": ["guests:statuses", "guests:form", "guests:name"],
    "S08": ["seatA:overview", "seatA:drag", "seatB:auto", "seatB:floorplan"],
    "S09": ["checkB:online_scan", "checkB:queued", "checkB:online", "checkB:synced"],
    "S10": ["gallery:top", "gallery:cards", "gallery:moderate"],
    "S11": ["cockpit:top", "cockpit:weddings", "cockpit:activity"],
    "S12": ["crm:pipeline", "crm:columns", "crm:notes"],
}


def resolve_take(takes: dict, ref: str) -> tuple[str, float]:
    """'take:mark+1.5' -> (file, start seconds)."""
    m = re.fullmatch(r"([\w]+):([\w]+)([+-]\d+(?:\.\d+)?)?", ref.strip())
    if not m:
        raise SystemExit(f"bad screen segment reference {ref!r}")
    take, mark, off = m.group(1), m.group(2), float(m.group(3) or 0)
    t = takes.get(take)
    if t is None or mark not in t["marks"]:
        raise SystemExit(f"screen segment {ref!r}: unknown take/mark")
    ss = max(0.0, t["marks"][mark] + off)
    if t.get("dur"):
        ss = min(ss, max(0.0, t["dur"] - 1.2))  # never seek into the last second: ffmpeg hangs on an empty stream
    return t["file"], round(ss, 2)


def dur(p: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out or 0)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("registry")
    ap.add_argument("out")
    ap.add_argument("--vo", required=True)
    ap.add_argument("--words", required=True)
    ap.add_argument("--sub", default="wedillybird.com/en")
    a = ap.parse_args()
    s = json.loads(Path(a.script).read_text())
    reg = json.loads(Path(a.registry).read_text())
    takes = reg.get("TAKES", {})
    segfile = Path(__file__).with_name("screen_segments.json")
    segmap = json.loads(segfile.read_text()).get(s["id"], {}) if segfile.exists() else {}
    used: dict[str, int] = {}
    beats = []
    for b in s["beats"]:
        vis = b["visual"] if isinstance(b["visual"], list) else [b["visual"]]
        shots = []
        for vi, v in enumerate(vis):
            kind, asset = v["kind"], v.get("asset")
            if kind == "CARD":
                sc = {"kind": "card", **v["card"]}
            else:
                entry = reg.get(kind, {}).get(asset)
                if entry is None and kind == "SCREEN" and reg.get("TAKES"):
                    entry = {"file": "", "takes": True}
                if entry is None and kind == "NORAH" and reg.get("PLACEHOLDER"):
                    pool = reg["PLACEHOLDER"]  # preview mode: stand-in stills until Norah footage exists
                    k = used.get("PLACEHOLDER", 0)
                    used["PLACEHOLDER"] = k + 1
                    entry = {"file": pool[k % len(pool)], "type": "still"}
                    kind_eff = "DECOR"
                else:
                    kind_eff = kind
                if entry is None:
                    raise SystemExit(f"{s['id']}: asset {kind}:{asset} missing from registry")
                n = used.get(f"{kind}:{asset}", 0)
                used[f"{kind}:{asset}"] = n + 1
                cname = v.get("crop") or ("wide", "medium", "tight", "medium")[n % 4]
                focus = v.get("focus", "center")
                focus = FOCUS.get(focus, focus) if isinstance(focus, str) else focus
                flip = bool(v.get("flip", n % 2 == 1))
                if kind == "SCREEN":
                    ref = segmap.get(f"{b['n']}.{vi}") or segmap.get(f"*{asset}.{n}")
                    if ref is None and takes and asset in SEQ:
                        ref = SEQ[asset][n % len(SEQ[asset])]
                    if ref is not None:
                        f, ss = resolve_take(takes, ref)
                        sc = {"kind": "screen", "src": f, "frame": "phone", "ss": ss}
                    else:  # legacy: raw capture segment, advancing 3 s per reuse
                        seg_ss = float(entry.get("ss", 0.0))
                        seg_dur = float(entry.get("dur", 6.0))
                        ss = seg_ss + min(n * 3.0, max(seg_dur - 2.5, 0.0))
                        sc = {"kind": "screen", "src": entry["file"], "frame": entry.get("frame", "phone"), "ss": round(ss, 2)}
                elif kind_eff == "DECOR" and entry.get("type", "still") == "still":
                    sc = {"kind": "still", "src": entry["file"], "kb": MOTION.get(v.get("motion", "push-in"), "in"),
                          "crop": CROPS.get(cname, 1.0) if n else 1.0, "focus": focus, "flip": flip}
                else:  # NORAH or DECOR clip
                    d = dur(entry["file"])
                    ss = min(n * 2.2, max(d - 3.2, 0.0)) if n else 0.0
                    sc = {"kind": "clip", "src": entry["file"], "ss": round(ss, 2), "crop": CROPS.get(cname, 1.0),
                          "focus": focus, "flip": flip, "zoom": 0.03}
            shots.append(sc)
        beat = {"vo": b["vo"]}
        if b.get("overlay"):
            beat["overlay"] = b["overlay"]
        if len(shots) == 1:
            beat["scene"] = shots[0]
        else:
            beat["shots"] = shots
        beats.append(beat)
    man = {
        "id": s["id"], "vo": str(Path(a.vo).resolve()), "words": str(Path(a.words).resolve()),
        "music": MUSIC.get(s.get("series"), "harmonie"),
        "outro": {"line": OUTRO.get(s.get("series"), "Follow for more"), "sub": a.sub, "dur": 2.4},
        "beats": beats,
    }
    Path(a.out).write_text(json.dumps(man, indent=1, ensure_ascii=False))
    print(f"{s['id']}: {len(beats)} beats -> {a.out}")


if __name__ == "__main__":
    main()
