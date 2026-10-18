#!/usr/bin/env python3
"""Render sample overlays and a long quote card to PNG for a visual check (no video build)."""
import importlib.util
import subprocess
from pathlib import Path

S = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("bv", S / "production" / "build_video.py")
bv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bv)
out = S / "work" / "ovtest"
out.mkdir(parents=True, exist_ok=True)
samples = [
    ("hook", "Guests who haven't replied? The exact text.", "clip"),
    ("cite", "A week after: The Knot, Joy (2025), Emily Post", "clip"),
    ("source", "Source: Joy, RSVP deadlines guide, 2025", "clip"),
    ("screen", "Real screens · demo data", "screen"),
    ("screen_long", "Source: The Knot 2026 survey, via The New York Times", "screen"),
    ("short", "Not this: replies in five places", "clip"),
]
bg = next((S / "assets" / "decor").glob("D01-A-d1.jpg"))
for name, text, kind in samples:
    ass = out / f"{name}.ass"
    bv.build_ass([], [{"text": text, "t0": 0.0, "t1": 3.0, "y": 470}], ass, [(0, 5, kind)])
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", str(bg), "-vf",
                    f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,ass=filename='{ass}':fontsdir='{bv.FONTS}'",
                    "-ss", "1", "-frames:v", "1", str(out / f"{name}.png")], check=True)
bv.make_card({"type": "quote", "text": "Hi! The caterer needs our final numbers by Friday. Can you tell us if you're coming?",
              "sub": "Version two | clear | a week after the deadline"}, out / "quote.png")
print("ok")
