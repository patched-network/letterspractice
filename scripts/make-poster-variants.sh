#!/usr/bin/env bash
#
# The landing page's demo-video poster, as the app ships it:
# src/assets/session-video/poster.jpg plus AVIF and WebP copies at the widths
# below. SessionVideoSection.vue offers whatever widths it finds there
# (srcset), so this list is the only one. Vite gives each file a content-hashed
# name, so replacing the frame is just rerunning this and committing.
#
#   scripts/make-poster-variants.sh <frame.jpg>
#
# The current frame is insert #4 `d-side` at SRC 235.40 of the demo master
# (the media host's deploy notes, kept with the deployment), 1280×720. Needs ImageMagick with AVIF
# support (`magick` or `convert`).
set -euo pipefail

SRC="${1:?usage: scripts/make-poster-variants.sh <frame.jpg>}"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/assets/session-video"
WIDTHS=(480 720 960 1280)

IM="$(command -v magick || command -v convert || true)"
if [[ -z "$IM" ]] || ! "$IM" -list format | grep -qE '^ *AVIF\*? .*rw'; then
    echo "need ImageMagick with AVIF write support (magick or convert)" >&2
    exit 69
fi

mkdir -p "$OUT"
rm -f "$OUT"/poster-*w.avif "$OUT"/poster-*w.webp
cp "$SRC" "$OUT/poster.jpg"
for w in "${WIDTHS[@]}"; do
    "$IM" "$SRC" -resize "${w}x" -strip -quality 78 "$OUT/poster-${w}w.webp"
    "$IM" "$SRC" -resize "${w}x" -strip -quality 55 "$OUT/poster-${w}w.avif"
done
ls -l "$OUT"
