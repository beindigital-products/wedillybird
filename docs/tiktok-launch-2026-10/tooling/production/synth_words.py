#!/usr/bin/env python3
"""Scratch timing for a script when no voice-over exists yet: estimated word timestamps + a silent WAV.

usage: synth_words.py <script.json> <out_dir>
Writes <out_dir>/<id>.words.json (same shape as transcribe.py) and <out_dir>/<id>.silence.wav.
Used only for silent previews; the real build always uses the TTS file and its Whisper timestamps.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

BASE, PER_CHAR = 0.155, 0.032      # seconds per word = BASE + PER_CHAR * letters  (~2.75 words/s with pauses)
PAUSE = {".": 0.36, "!": 0.36, "?": 0.40, ":": 0.22, ";": 0.2, ",": 0.15}


def main() -> None:
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    j = json.loads(src.read_text())
    t, words = 0.25, []
    for tok in j["voiceover"].split():
        letters = len(re.sub(r"[^A-Za-z0-9]", "", tok)) or 1
        d = BASE + PER_CHAR * letters
        words.append({"w": tok, "s": round(t, 3), "e": round(t + d, 3)})
        t += d + next((p for ch, p in PAUSE.items() if tok.endswith(ch)), 0.0)
    total = round(t + 0.6, 3)
    (out / f"{j['id']}.words.json").write_text(json.dumps({"text": j["voiceover"], "duration": total, "words": words}))
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"anullsrc=r=24000:cl=mono", "-t", f"{total}",
                    str(out / f"{j['id']}.silence.wav")], check=True)
    print(f"{j['id']}: {len(words)} words, {total:.1f}s scratch timing")


if __name__ == "__main__":
    main()
