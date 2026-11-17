#!/usr/bin/env bash
# Installs scenes/_project.js + lib.js onto the 2x recording context once (as ctx._L), so each
# scene's run_code payload stays small. Run from recordings/, after every _setup.run.js, then
# wrap scenes with `mk-scene.sh <name> --use-lib`.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
[ -f scenes/_project.js ] || { echo "mk-lib: scenes/_project.js not found (run from the recordings dir)" >&2; exit 1; }
out_dir="${PLAYWRIGHT_MCP_OUT:?set PLAYWRIGHT_MCP_OUT to <session cwd>/.playwright-mcp}/scenes"
mkdir -p "$out_dir"
{
  echo 'async (page) => {'
  cat scenes/_project.js; echo
  node "$here/rx-tokens.mjs"   # the running receiver's token; re-run after restarting it
  cat "$here/lib.js"; echo
  echo 'ctx._L = { PROJECT, sleep, W, H, api, findTab, openTab, tabFor, ensure, prep, hideClutter, record, now, blur, blurRect, glide, tap, click, typeHuman, smoothScroll, scrollIntoCenter, park, moveHuman, placeCursor, maskSecrets, maskedSummary, scoutRects };'
  echo 'return "lib installed";'
  echo '}'
} > "$out_dir/_lib.run.js"
echo "$out_dir/_lib.run.js"
