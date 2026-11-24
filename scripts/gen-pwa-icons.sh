#!/usr/bin/env bash
# Rasterise public/favicon.svg into the PNG/ICO icons the PWA manifest and
# index.html reference. Re-run after changing the favicon; outputs are
# committed to public/.
#
# Needs inkscape + ImageMagick 6 (`convert`).
#
#   any       — transparent, glyph fills most of the square (manifest
#               `purpose: any`, browser tabs)
#   maskable  — opaque, glyph inside the 80%-diameter safe circle, because
#               Android launchers crop to a circle/squircle
#   apple     — opaque (iOS fills transparency with black and rounds the
#               corners itself)
set -euo pipefail

cd "$(dirname "$0")/.."
SRC=public/favicon.svg
OUT=public
BG="#FFFEF7" # theme `background` (skuilder.config.json) — also the app bar

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Render big, then trim to the glyph's own bounds: the SVG canvas is not
# centred on the glyph (it is skewed), so all placement works from the trim.
inkscape "$SRC" --export-type=png --export-filename="$tmp/full.png" -w 2048 -h 2048 >/dev/null 2>&1
convert "$tmp/full.png" -trim +repage "$tmp/glyph.png"
read -r gw gh < <(identify -format "%w %h\n" "$tmp/glyph.png")

# fit SIZE BOX BG OUT — glyph scaled to fit a BOX×BOX square, centred on SIZE×SIZE
fit() {
  convert "$tmp/glyph.png" -resize "${2}x${2}" -background "$3" \
    -gravity center -extent "${1}x${1}" "$4"
}

# Box for the maskable icon: the glyph's diagonal must fit the safe circle
# (diameter 0.8 × size); 0.76 leaves a little air inside it.
diag_box() {
  awk -v s="$1" -v w="$gw" -v h="$gh" \
    'BEGIN { d = sqrt(w*w + h*h); printf "%d", s * 0.76 * (w > h ? w : h) / d }'
}

fit 16 16 none "$OUT/favicon-16x16.png"
fit 32 32 none "$OUT/favicon-32x32.png"
fit 48 48 none "$tmp/favicon-48.png"
convert "$OUT/favicon-16x16.png" "$OUT/favicon-32x32.png" "$tmp/favicon-48.png" "$OUT/favicon.ico"

fit 192 176 none "$OUT/pwa-192x192.png"
fit 512 470 none "$OUT/pwa-512x512.png"
fit 512 "$(diag_box 512)" "$BG" "$OUT/pwa-maskable-512x512.png"
fit 180 144 "$BG" "$OUT/apple-touch-icon.png"

# Opaque icons must have no alpha left (iOS would show black through it).
for f in "$OUT/pwa-maskable-512x512.png" "$OUT/apple-touch-icon.png"; do
  convert "$f" -background "$BG" -alpha remove -alpha off "$f"
done

identify "$OUT"/favicon-*.png "$OUT"/favicon.ico "$OUT"/pwa-*.png "$OUT"/apple-touch-icon.png
