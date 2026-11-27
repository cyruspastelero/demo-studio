#!/usr/bin/env bash
# Builds deskcap (desktop recording for apps outside the browser) next to this script.
# macOS 14+ with the Xcode command line tools (xcode-select --install). Rebuilds only when the source changed.
# Usage: bash scripts/desktop/build.sh   -> prints the binary path
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin="$here/deskcap"

[ "$(uname -s)" = Darwin ] || { echo "deskcap: desktop recording needs macOS" >&2; exit 1; }
command -v swiftc >/dev/null || { echo "deskcap: swiftc missing; run: xcode-select --install" >&2; exit 1; }

stale=0
[ -x "$bin" ] || stale=1
for f in "$here"/src/*.swift; do [ "$f" -nt "$bin" ] && stale=1; done
if [ "$stale" = 1 ]; then
  tmp="$bin.tmp.$$"
  trap 'command rm -f "$tmp"' EXIT
  swiftc -O -parse-as-library -target "$(uname -m)-apple-macos14.0" "$here"/src/*.swift -o "$tmp"
  mv "$tmp" "$bin"
fi
echo "$bin"
