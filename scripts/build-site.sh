#!/usr/bin/env bash
# Assemble the GitHub Pages demo site into ./_site (or $1).
# The sample videos are not in git: pass a folder holding sample-*.mp4 as $2,
# or the Pages workflow downloads them from the "samples" release.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/_site}"
MEDIA="${2:-}"
# OUT is deleted first, so only clear a folder this script built (it holds the marker) or an empty one.
MARKER=".demo-studio-site"
case "$OUT" in ""|/|"$ROOT"|"$HOME") echo "build-site: refusing to clear $OUT" >&2; exit 1;; esac
if [ -L "$OUT" ] || { [ -e "$OUT" ] && ! [ -d "$OUT" ]; }; then
  echo "build-site: $OUT is a symlink or not a folder; refusing to clear it" >&2; exit 1
fi
if [ -d "$OUT" ] && ! [ -f "$OUT/$MARKER" ] && [ -n "$(ls -A "$OUT")" ]; then
  echo "build-site: $OUT is not empty and was not built by build-site.sh (no $MARKER); refusing to clear it" >&2; exit 1
fi
rm -rf "$OUT"
mkdir -p "$OUT/logo" "$OUT/fonts" "$OUT/img" "$OUT/media"
: > "$OUT/$MARKER"
/bin/cp -f "$ROOT/site/index.html" "$OUT/"
/bin/cp -f "$ROOT"/assets/logo/*.svg "$ROOT"/assets/logo/*.png "$OUT/logo/"
/bin/cp -f "$ROOT"/site/fonts/* "$ROOT/assets/fonts/GeistMonoVariable.woff2" "$ROOT/assets/fonts/GeistVariable.woff2" "$ROOT/assets/fonts/OFL-Geist.txt" "$OUT/fonts/"
/bin/cp -f "$ROOT"/docs/img/sample-*-poster.jpg "$ROOT/docs/img/studio-1440.png" "$ROOT/docs/img/editor.gif" "$OUT/img/"
mkdir -p "$OUT/img/house" && /bin/cp -f "$ROOT"/look-templates/house/preview/*.png "$OUT/img/house/"
mkdir -p "$OUT/img/looks" && for l in house midnight paper mono; do /bin/cp -f "$ROOT/look-templates/$l/preview/01.png" "$OUT/img/looks/$l.png"; /bin/cp -f "$ROOT/look-templates/$l/preview/02.png" "$OUT/img/looks/$l-stage.png"; done
/bin/cp -f "$ROOT/site/og-image.png" "$ROOT/site/robots.txt" "$ROOT/site/sitemap.xml" "$OUT/"
mkdir -p "$OUT/img/motion" && for s in airy daylight nocturne showroom; do /bin/cp -f "$ROOT/motion-templates/$s/preview/02.jpg" "$OUT/img/motion/$s.jpg"; done
if [ -f "$ROOT/app/out-static/index.html" ]; then
  rm -rf "$OUT/editor" && /bin/cp -R "$ROOT/app/out-static" "$OUT/editor"
else
  echo "note: no live editor (run: npm run build -w app && npm run build:static -w app)" >&2
fi
if [ -n "$MEDIA" ]; then /bin/cp -f "$MEDIA"/sample-*.mp4 "$OUT/media/"; fi
echo "site built in $OUT"
