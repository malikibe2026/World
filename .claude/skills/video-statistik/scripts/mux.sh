#!/usr/bin/env bash
# Joins the 60 fps segments, blends frame pairs into 30 fps (natural motion blur), adds the score
# normalised to -16 LUFS, then makes the shareable two-pass encode.
# usage: mux.sh <segdir> <score.wav> <final.mp4> [video_kbps]   (16:9 ~5600, 9:16 ~6000 -> ~45 MB)
set -euo pipefail
SEG="$1"; SCORE="$2"; OUT="$3"; KBPS="${4:-5600}"
MASTER="${OUT%.mp4}-master.mp4"
ls "$SEG"/s[0-9].mp4 | sort | sed "s#^$SEG/#file '#; s#\$#'#" > "$SEG/list.txt"
ffmpeg -loglevel error -y -f concat -safe 0 -i "$SEG/list.txt" -i "$SCORE" \
  -filter_complex "[0:v]tmix=frames=2:weights='1 1',framestep=2,format=yuv420p[v];[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 17 -profile:v high -level 4.2 -r 30 -c:a aac -b:a 192k -ar 48000 \
  -movflags +faststart -t 60 "$MASTER"
# film grain makes the crf master very large (300+ MB); the two-pass encode is what gets shared
LOG="$(dirname "$OUT")/ffpass-$(basename "$OUT" .mp4)"
ffmpeg -loglevel error -y -i "$MASTER" -c:v libx264 -preset slow -b:v "${KBPS}k" -pass 1 -passlogfile "$LOG" -an -f null /dev/null
ffmpeg -loglevel error -y -i "$MASTER" -c:v libx264 -preset slow -b:v "${KBPS}k" -maxrate "$((KBPS * 3 / 2))k" -bufsize 12000k \
  -pass 2 -passlogfile "$LOG" -profile:v high -pix_fmt yuv420p -c:a copy -movflags +faststart "$OUT"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of compact "$OUT"
