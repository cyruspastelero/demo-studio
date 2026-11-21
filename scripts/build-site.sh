#!/usr/bin/env bash
# Assemble the GitHub Pages demo site into ./_site (or $1).
# The sample videos are not in git: pass a folder holding sample-*.mp4 as $2,
# or the Pages workflow downloads them from the "samples" release.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/_site}"
MEDIA="${2:-}"
case "$OUT" in ""|/|"$ROOT"|"$HOME") echo "build-site: refusing to clear $OUT" >&2; exit 1;; esac
rm -rf "$OUT"
mkdir -p "$OUT/logo" "$OUT/fonts" "$OUT/img" "$OUT/media"
/bin/cp -f "$ROOT/site/index.html" "$OUT/"
/bin/cp -f "$ROOT"/assets/logo/*.svg "$ROOT"/assets/logo/*.png "$OUT/logo/"
/bin/cp -f "$ROOT"/site/fonts/* "$ROOT/assets/fonts/GeistMonoVariable.woff2" "$ROOT/assets/fonts/OFL-Geist.txt" "$OUT/fonts/"
/bin/cp -f "$ROOT"/docs/img/sample-*-poster.jpg "$ROOT/docs/img/studio-1440.png" "$OUT/img/"
mkdir -p "$OUT/img/house" && /bin/cp -f "$ROOT"/look-templates/house/preview/*.png "$OUT/img/house/"
if [ -f "$ROOT/app/out-static/index.html" ]; then
  rm -rf "$OUT/editor" && /bin/cp -R "$ROOT/app/out-static" "$OUT/editor"
else
  echo "note: no live editor (run: npm run build -w app && npm run build:static -w app)" >&2
fi
if [ -n "$MEDIA" ]; then /bin/cp -f "$MEDIA"/sample-*.mp4 "$OUT/media/"; fi
echo "site built in $OUT"
