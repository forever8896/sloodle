#!/usr/bin/env bash
# Builds RGBA PNG sequences of every Sloo clip from the 1440px masters and their mattes, cropped to the area
# Sloo ever occupies (including the cheer hop and happy wings) and scaled to 1024x1024.
# Output: ad/public/sloo-frames/<state>/0001.png ... (24 fps source frames, 96 per clip, last frame trimmed so loops join).
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
out="$root/ad/public/sloo-frames"
for s in idle listening thinking writing talking happy cheer wave; do
  mkdir -p "$out/$s"
  rm -f "$out/$s"/*.png
  ffmpeg -v error -y -i "$root/media/sloo/clips/$s.mp4" -i "$root/media/sloo/mattes/$s.mp4" -filter_complex \
    "[0:v]setpts=PTS-STARTPTS,format=rgb24[c];[1:v]setpts=PTS-STARTPTS,format=gray,scale=1440:1440:flags=bicubic,erosion=threshold0=40[m];[c][m]alphamerge=shortest=1,trim=end_frame=96,crop=1312:1312:64:0,scale=1024:1024:flags=lanczos,format=rgba" \
    -start_number 0 "$out/$s/%03d.png"
  echo "$s $(ls "$out/$s" | wc -l)"
done

# A full-resolution copy of the clips used in close-ups.
for s in happy; do
  mkdir -p "$out/$s-hd"
  rm -f "$out/$s-hd"/*.png
  ffmpeg -v error -y -i "$root/media/sloo/clips/$s.mp4" -i "$root/media/sloo/mattes/$s.mp4" -filter_complex \
    "[0:v]setpts=PTS-STARTPTS,format=rgb24[c];[1:v]setpts=PTS-STARTPTS,format=gray,scale=1440:1440:flags=bicubic,erosion=threshold0=40[m];[c][m]alphamerge=shortest=1,trim=end_frame=96,crop=1312:1312:64:0,format=rgba" \
    -start_number 0 "$out/$s-hd/%03d.png"
  echo "$s-hd $(ls "$out/$s-hd" | wc -l)"
done
