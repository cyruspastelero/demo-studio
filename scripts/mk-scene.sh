#!/usr/bin/env bash
# Wraps a scene body into a Playwright MCP run_code file:
#   <mcp-out>/scenes/<name>.run.js = async (page) => { _project.js + lib.js + <name>.body.js }
# Playwright MCP only reads `filename` scripts under its own output folder, which is
# <cwd of the Claude session>/.playwright-mcp. Override with PLAYWRIGHT_MCP_OUT.
# With --use-lib the file only pulls the helpers from ctx._L (installed once by mk-lib.sh),
# which keeps each run_code payload small.
# Usage (from the recordings dir): mk-scene.sh <name> [--use-lib]   (reads scenes/<name>.body.js)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
name="${1:?scene name}"
mode="${2:-}"
body="scenes/${name}.body.js"
[ -f "$body" ] || { echo "mk-scene: $body not found (run from the recordings dir)" >&2; exit 1; }
out_dir="${PLAYWRIGHT_MCP_OUT:?set PLAYWRIGHT_MCP_OUT to <session cwd>/.playwright-mcp}/scenes"
mkdir -p "$out_dir"
{
  echo 'async (page) => {'
  if [ "$mode" = "--use-lib" ]; then
    echo 'const ctx = page.context().browser().contexts().find(c => c !== page.context());'
    echo 'if (!ctx || !ctx._L) throw new Error("helpers missing: run mk-lib.sh and its _lib.run.js first");'
    echo 'const { PROJECT, sleep, W, H, api, findTab, openTab, tabFor, ensure, prep, hideClutter, record, now, blur, blurRect, glide, tap, click, typeHuman, smoothScroll, scrollIntoCenter, park, moveHuman, placeCursor, maskSecrets, maskedSummary, scoutRects } = ctx._L;'
  elif [ -n "$mode" ]; then
    echo "mk-scene: unknown option $mode" >&2; exit 1
  else
    if [ -f scenes/_project.js ]; then cat scenes/_project.js; else echo 'const PROJECT = {};'; fi; echo
    node "$here/rx-tokens.mjs"   # the running receiver's token; re-wrap after restarting it
    cat "$here/lib.js"; echo
  fi
  echo 'let stop = null;'
  echo 'try {'
  cat "$body"; echo
  echo '} finally { if (stop) await stop(); }'
  echo '}'
} > "$out_dir/${name}.run.js"
echo "$out_dir/${name}.run.js"
