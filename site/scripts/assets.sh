#!/usr/bin/env bash
# Copies and converts the media the page uses into public/. Reads from ../public, ../media/ad; never writes outside site/.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
app="$(cd "$here/.." && pwd)"
out="$here/public"
mkdir -p "$out/sloo" "$out/samples" "$out/media"

# Sloo: the clips are packed by scripts/sloo-web.sh from the ad's master frames; the still used beside the wordmark:
magick "$app/public/sloo/hero.png" -trim +repage -resize 96x -quality 88 -define webp:alpha-quality=95 "$out/sloo/mark.webp"

# The lesson pictures the sample components show (public-domain copies).
cp "$app"/public/samples/*.jpg "$out/samples/"

# The ad: one H.264 + AAC web copy, and its poster.
if [ ! -f "$out/media/sloodle-ad.mp4" ] || [ "${REENCODE:-0}" = 1 ]; then
  ffmpeg -loglevel error -y -i "$app/media/ad/sloodle-ad.mp4" -vf "scale=1280:720:flags=lanczos,fps=30" \
    -c:v libx264 -preset veryslow -profile:v high -pix_fmt yuv420p -b:v 700k -maxrate 1400k -bufsize 2800k -pass 1 -an -f mp4 /dev/null
  ffmpeg -loglevel error -y -i "$app/media/ad/sloodle-ad.mp4" -vf "scale=1280:720:flags=lanczos,fps=30" \
    -c:v libx264 -preset veryslow -profile:v high -pix_fmt yuv420p -b:v 700k -maxrate 1400k -bufsize 2800k -pass 2 \
    -c:a aac -b:a 96k -ac 2 -movflags +faststart "$out/media/sloodle-ad.mp4"
  rm -f ffmpeg2pass-0.log ffmpeg2pass-0.log.mbtree
fi
magick "$app/media/ad/sloodle-ad-poster.png" -resize 1280x720 -quality 80 "$out/media/sloodle-ad-poster.webp"

# Sharing card 1200x630 and icons, from the ad's stills and the owl.
magick "$app/media/ad/sloodle-ad-poster.png" -resize 1200x675 -gravity center -crop 1200x630+0+0 +repage -strip "$out/og.png"
magick "$app/public/sloo/hero.png" -trim +repage -gravity north -crop 100%x62%+0+0 +repage -background none -gravity center -extent "%[fx:max(w,h)]x%[fx:max(w,h)]" -resize 256x256 "$here/scripts/.head.png"
magick "$here/scripts/.head.png" -resize 32x32 "$out/favicon-32.png"
magick "$here/scripts/.head.png" -resize 192x192 "$out/icon-192.png"
magick "$here/scripts/.head.png" -resize 150x150 -background "#f1ecfa" -gravity center -extent 180x180 "$out/apple-touch-icon.png"
rm -f "$here/scripts/.head.png"
ls -la "$out" "$out/sloo" "$out/media"
