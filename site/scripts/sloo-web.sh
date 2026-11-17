#!/usr/bin/env bash
# Packs the page's copies of Sloo's clips from the ad's 1024px master frames (ad/public/sloo-frames, local only), with
# a wider frame than the app's clips so a raised wing (wave, happy) is never cut at the edge. Same file contract as
# scripts/sloo-pack.sh: <state>.webm (VP9 alpha, 640x704), <state>.mp4 (H.264, colour over alpha, 640x1408) and a
# <state>.webp poster (first frame). Feet sit at 96% of the frame height, where the app draws the ground shadow.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
frames="$here/../ad/public/sloo-frames"
out="$here/public/sloo"
mkdir -p "$out"
fit="scale=640:640:flags=lanczos,format=rgba,pad=640:704:0:55:color=black@0"
tag=(-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv)
for state in idle listening thinking writing talking happy cheer wave; do
  graph="[0:v]$fit,split=4[c][m][p][n];[c]premultiply=inplace=1,format=rgb24[cp];[m]alphaextract,format=rgb24[a];\
[cp][a]vstack=inputs=2,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v];[p]trim=end_frame=1[poster];[n]format=yuva420p[native]"
  ffmpeg -hide_banner -loglevel error -y -framerate 24 -i "$frames/$state/%03d.png" -filter_complex "$graph" \
    -map "[v]" -frames:v 96 -an -c:v libx264 -preset slow -crf 22 -profile:v high -level 4.0 -pix_fmt yuv420p -g 48 \
    -movflags +faststart "${tag[@]}" "$out/$state.mp4" \
    -map "[poster]" -frames:v 1 -update 1 "$out/.$state.png" \
    -map "[native]" -frames:v 96 -an -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 -deadline good -cpu-used 2 -g 48 -auto-alt-ref 0 \
    -pix_fmt yuva420p "$out/$state.webm"
  magick "$out/.$state.png" -quality 86 -define webp:alpha-quality=95 -define webp:method=6 "$out/$state.webp"
  rm "$out/.$state.png"
  printf '%-10s webm %4d KB  mp4 %4d KB  webp %3d KB\n' "$state" $(($(stat -c %s "$out/$state.webm") / 1024)) $(($(stat -c %s "$out/$state.mp4") / 1024)) $(($(stat -c %s "$out/$state.webp") / 1024))
done
