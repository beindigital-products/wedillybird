#!/bin/bash
# Silent preview of one video: scratch word timing + real decor/screens + placeholders for Norah beats.
# usage: make_preview.sh D06-B [extra build_video.py args]
set -e
ID="$1"; shift || true
S="$(cd "$(dirname "$0")/.." && pwd)"
SC="$S/scripts"; [ -d "$SC" ] || SC="$S/../scripts"
W="$S/work/preview/$ID"; mkdir -p "$W"
PY="$S/venv/bin/python"
"$PY" "$S/production/synth_words.py" "$SC/$ID.json" "$W"
"$PY" "$S/production/build_registry.py" >/dev/null
"$PY" "$S/production/make_manifest.py" "$SC/$ID.json" "$S/production/registry.json" "$W/manifest.json" \
      --vo "$W/$ID.silence.wav" --words "$W/$ID.words.json"
"$PY" "$S/production/build_video.py" "$W/manifest.json" "$W/${ID}_raw.mp4" --work "$W/tmp" --cover "$W/${ID}_cover.jpg" "$@"
ffmpeg -y -v error -i "$W/${ID}_raw.mp4" -c:v copy -af "volume=-9dB" -c:a aac -b:a 160k "$W/${ID}_preview.mp4"
echo "$W/${ID}_preview.mp4"
