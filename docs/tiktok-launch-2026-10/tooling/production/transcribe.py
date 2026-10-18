#!/usr/bin/env python3
"""Word-level transcription of a voice-over file (used for captions + QA).

usage: transcribe.py <audio> <out.json> [model=base.en]
Writes {"text": str, "duration": float, "words": [{"w": str, "s": float, "e": float}]}

Audio is decoded with ffmpeg (16 kHz mono float32) and handed to Whisper as an
array, which sidesteps PyAV/faster-whisper version mismatches.
"""
import json
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel


def decode(path: str) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def main() -> None:
    audio, out = sys.argv[1], sys.argv[2]
    model_name = sys.argv[3] if len(sys.argv) > 3 else "base.en"
    samples = decode(audio)
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(
        samples,
        language="en",
        word_timestamps=True,
        vad_filter=False,
        beam_size=5,
        condition_on_previous_text=False,
    )
    words = []
    text_parts = []
    for seg in segments:
        text_parts.append(seg.text.strip())
        for w in seg.words or []:
            words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)})
    json.dump(
        {
            "text": " ".join(text_parts),
            "duration": round(len(samples) / 16000, 3),
            "words": words,
        },
        open(out, "w"),
        ensure_ascii=False,
        indent=1,
    )
    print(f"{len(words)} words, {len(samples) / 16000:.2f}s -> {out}")


if __name__ == "__main__":
    main()
