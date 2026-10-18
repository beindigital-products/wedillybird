#!/bin/bash
# Build several silent previews one after the other: run_previews.sh D01-A D06-B
S="$(cd "$(dirname "$0")/.." && pwd)"
for ID in "$@"; do
  "$S/production/make_preview.sh" "$ID" > "$S/logs/preview_$ID.log" 2>&1
done
