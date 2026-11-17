#!/usr/bin/env bash
# Packs one Sloo clip with transparency into the files the character stage plays.
# See docs/sloo-character.md ("File contract") for what the outputs must be.
#
#   scripts/sloo-pack.sh <input> <out-dir> <name> [--matte <mask-video>] [--key 0xRRGGBB] [--trim-last] [--fps 24]
#
# <input>       a video with an alpha channel, square (framed like the hero still) or already 640x704: ProRes 4444 .mov,
#               a PNG sequence such as frames/%04d.png, or a VP9-alpha .webm. With --key, a clip on a flat colour instead.
# --matte       a separate mask video (white = Sloo, black = background), as background-removal tools often return;
#               <input> is then the original clip, background and all.
# --key         keys out a flat background colour. Not for the sand backdrop: it is too close to Sloo's cream belly.
# --trim-last   drops the final frame, for clips generated to end on the same frame they start on,
#               so the loop does not show that pose twice.
#
# Writes <name>.webm: VP9 with a real alpha channel, 640x704 (played directly where the engine keeps the alpha).
# Writes <name>.mp4: H.264 with colour on top and alpha as grey below, 640x1408 (composited on a canvas elsewhere).
# Writes <name>.png: the first frame with real transparency, 640x704, for the poster.
set -euo pipefail

input=${1:?input}
out=${2:?out-dir}
name=${3:?name}
shift 3
key=""
matte=""
trim=0
fps=24
while [ $# -gt 0 ]; do
  case $1 in
    --key) key=$2; shift 2 ;;
    --matte) matte=$2; shift 2 ;;
    --trim-last) trim=1; shift ;;
    --fps) fps=$2; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

W=640
H=704
mkdir -p "$out"

decoder=()
case $input in *.webm) decoder=(-c:v libvpx-vp9) ;; esac

count() { ffprobe -v error "$@" -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 | head -1; }
# The output is bounded by an explicit frame count: with a matte, ffmpeg 9's frame sync sometimes held the last frame
# for seconds past the end of the clip, so the length must not depend on how the inputs finish.
frames=$(count "${decoder[@]}" "$input")
if [ -n "$matte" ]; then
  matte_frames=$(count "$matte")
  [ "$matte_frames" -lt "$frames" ] && frames=$matte_frames
fi
[ $trim = 1 ] && frames=$((frames - 1))
pre="fps=$fps,trim=end_frame=$frames,setpts=N/($fps*TB)"
if [ -n "$key" ]; then
  pre="$pre,format=rgba,colorkey=$key:0.28:0.12,despill=type=blue:mix=0.5:expand=0.1"
fi
# A square input is framed like the hero still (media/sloo/hero-cutout.png): it is cropped exactly as public/sloo/hero.png
# was, so every clip lines up with the poster. Anything else is fitted inside the frame, feet on the bottom edge.
size=$(ffprobe -v error "${decoder[@]}" -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$input" | head -1)
if [ "${size%x*}" = "${size#*x}" ]; then
  fit="scale=791:791:flags=lanczos,format=rgba,crop=$W:$H:74:23"
else
  fit="scale=$W:$H:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=$W:$H:(ow-iw)/2:(oh-ih):color=black@0"
fi

source="[0:v]"
inputs=("${decoder[@]}" -i "$input")
if [ -n "$matte" ]; then
  source="[0:v]setpts=PTS-STARTPTS,format=rgba[colour];[1:v]setpts=PTS-STARTPTS,format=gray,scale=${size%x*}:${size#*x}[mask];[colour][mask]alphamerge=shortest=1:repeatlast=0,"
  inputs+=(-i "$matte")
fi
graph="$source$pre,$fit,split=4[c][m][p][n];\
[c]premultiply=inplace=1,format=rgb24[cp];\
[m]alphaextract,format=rgb24[a];\
[cp][a]vstack=inputs=2,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v];\
[p]trim=end_frame=1[poster];\
[n]format=yuva420p[native]"

tag=(-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv)

ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" -filter_complex "$graph" \
  -map "[v]" -frames:v "$frames" -an -c:v libx264 -preset slow -crf 20 -profile:v high -level 4.0 -pix_fmt yuv420p -g 48 \
  -movflags +faststart "${tag[@]}" "$out/$name.mp4" \
  -map "[poster]" -frames:v 1 -update 1 "$out/$name.png" \
  -map "[native]" -frames:v "$frames" -an -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -deadline good -cpu-used 2 -g 48 -auto-alt-ref 0 \
  -pix_fmt yuva420p "$out/$name.webm"

for f in "$out/$name.mp4" "$out/$name.webm" "$out/$name.png"; do
  printf '%-40s %6d KB\n' "$f" $(($(stat -c %s "$f") / 1024))
done
