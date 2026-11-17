#!/usr/bin/env bash
# Makes the synthetic stand-in clips the audition page uses to prove the video path before character art exists.
# A labelled blob with soft edges, eyes and a 35% halo (to show partial transparency), packed by sloo-pack.sh.
#
#   scripts/sloo-test-clips.sh            # writes src/components/sloo/test-media/
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../src/components/sloo/test-media"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
font=$(fc-match -f '%{file}' sans:bold)

# name  seconds  centre-x  centre-y  radius  r g b  label
clip() {
  local name=$1 dur=$2 cx=$3 cy=$4 rad=$5 r=$6 g=$7 b=$8 label=$9
  local d="hypot(X-($cx),Y-($cy))"
  local eye="lt(hypot(X-($cx)+70,Y-($cy)+40),26)+lt(hypot(X-($cx)-70,Y-($cy)+40),26)"
  local body="clip(($rad-$d)/2.5,0,1)"
  local halo="between($d,$rad+18,$rad+40)"
  ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=black@0:s=640x704:r=24:d=$dur,format=rgba" \
    -vf "geq=r='if($eye,25,if($halo,255,$r))':g='if($eye,30,if($halo,255,$g))':b='if($eye,40,if($halo,255,$b))':a='max(255*$body,90*$halo)',\
drawtext=fontfile=$font:text='$label':fontsize=44:fontcolor=0x13241a:x=(w-tw)/2:y=(${cy//T/t})+40" \
    -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le "$tmp/$name.mov"
  "$here/sloo-pack.sh" "$tmp/$name.mov" "$out" "$name"
}

P="2*PI*T"
clip idle-a    4   320               "430+10*sin($P/4)" 205                       120 196 142 "IDLE A"
clip idle-b    4   320               430                "205+6*sin($P/2)"         104 186 170 "IDLE B"
clip thinking  4   "320+16*sin($P/4)" 430               205                       150 162 226 "THINKING"
clip talking   2   320               430                "205+8*abs(sin($P*2))"    240 170 110 "TALKING"
clip correct   1.5 320               "430-70*sin(PI*T/1.5)" 205                   240 200 60  "CORRECT"
clip encourage 2   320               430                "205+10*sin($P/2)"        236 150 172 "KEEP GOING"
