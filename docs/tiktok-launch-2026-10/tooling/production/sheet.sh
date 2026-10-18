#!/bin/bash
# usage: sheet.sh <video.mp4> <out.png> [fps=1] [cols=8] [tile_w=170]
V="$1"; O="$2"; FPS="${3:-1}"; COLS="${4:-8}"; TW="${5:-170}"
TH=$(( TW*16/9 ))
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$V")
N=$(python3 -c "import math;print(math.ceil(float('$D')*float('$FPS')))")
ROWS=$(( (N+COLS-1)/COLS ))
FONT=$(dirname "$0")/../assets/fonts/Geist-Medium.ttf
ffmpeg -y -v error -i "$V" -vf "fps=$FPS,scale=$TW:$TH,drawtext=fontfile=$FONT:text='%{pts\:flt}':x=6:y=6:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=${COLS}x${ROWS}" -frames:v 1 "$O"
