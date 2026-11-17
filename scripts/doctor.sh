#!/usr/bin/env bash
# Checks everything demo-studio needs and prints the exact fix for anything missing.
# Exit code 0 when every required item passes. Optional items only warn.
# Usage: doctor.sh [demo-dir-for-disk-check]
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
target="${1:-$PWD}"
fails=0
is_mac=0; [ "$(uname -s)" = "Darwin" ] && is_mac=1

ok()   { printf '  ok    %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n        fix: %s\n' "$1" "$2"; fails=$((fails + 1)); }
warn() { printf '  warn  %s\n        %s\n' "$1" "$2"; }
brew_or() { if [ "$is_mac" = 1 ]; then echo "brew install $1"; else echo "$2"; fi; }

echo "demo-studio doctor (plugin at $root)"

if command -v claude >/dev/null 2>&1; then ok "Claude Code $(claude --version 2>/dev/null | head -1)"
else bad "Claude Code not found" "npm i -g @anthropic-ai/claude-code"; fi

if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -ge 20 ]; then ok "Node.js $(node --version)"
  else bad "Node.js $(node --version) is older than 20" "$(brew_or node 'install Node.js 22 LTS from https://nodejs.org')"; fi
else bad "Node.js not found (20+ needed, 22 LTS recommended)" "$(brew_or node 'install Node.js 22 LTS from https://nodejs.org')"; fi

if command -v node >/dev/null 2>&1 && (cd "$root" && node -e "require.resolve('playwright-core')" >/dev/null 2>&1); then
  ok "playwright-core $(cd "$root" && node -p "require('playwright-core/package.json').version")"
else bad "playwright-core not installed in the plugin folder" "npm install --prefix \"$root\""; fi

if command -v node >/dev/null 2>&1 && (cd "$root/app" && node -e "require.resolve('vite'); require.resolve('react'); require.resolve('ajv')" >/dev/null 2>&1); then
  ok "local editor packages (npm run studio)"
else warn "local editor packages not installed" "Optional, for npm run studio. Fix: npm install --prefix \"$root\""; fi

if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
  ok "Python $(python3 -c 'import platform; print(platform.python_version())')"
else bad "Python 3.10+ not found" "$(brew_or python@3.12 'install Python 3.10+ from https://www.python.org')"; fi

if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264; then ok "ffmpeg $(ffmpeg -version | head -1 | awk '{print $3}') with libx264"
  else bad "ffmpeg has no libx264 encoder" "$(brew_or ffmpeg 'install an ffmpeg build with --enable-libx264')"; fi
  # ffmpeg parses media from demo folders other people made; old releases have known demuxer bugs.
  ffv="$(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')"
  ffmajor="$(printf '%s' "$ffv" | sed -E 's/^n?([0-9]+).*/\1/')"
  if printf '%s' "$ffmajor" | grep -Eq '^[0-9]+$' && [ "$ffmajor" -ge 6 ]; then ok "ffmpeg $ffv is 6.0 or newer"
  elif printf '%s' "$ffmajor" | grep -Eq '^[0-9]+$'; then warn "ffmpeg $ffv is older than 6.0" "It reads media from shared demo folders; update it: $(brew_or ffmpeg 'apt install ffmpeg (or a newer static build)')"
  else warn "could not read the ffmpeg version ($ffv)" "Make sure it is 6.0 or newer and kept updated: it parses media from shared demo folders"; fi
  if ffmpeg -hide_banner -filters 2>/dev/null | grep -q ' drawtext '; then ok "ffmpeg drawtext (social caption text)"
  else warn "ffmpeg has no drawtext filter" "Fine: render caption PNGs with: node \"$root/scripts/title-cards.mjs\" handoff.json --social"; fi
else bad "ffmpeg/ffprobe not found" "$(brew_or ffmpeg 'apt install ffmpeg')"; fi

chrome=""
for c in "${CHROME_PATH:-}" "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "$(command -v google-chrome 2>/dev/null || true)" "$(command -v google-chrome-stable 2>/dev/null || true)"; do
  if [ -n "$c" ] && [ -x "$c" ]; then chrome="$c"; break; fi
done
if [ -n "$chrome" ]; then ok "Google Chrome"
else bad "Google Chrome not found" "$(brew_or '--cask google-chrome' 'install Chrome from https://www.google.com/chrome')"; fi

# Pinned so a new upstream release cannot change what runs with access to the logged-in browser.
# Bump deliberately after reading the release notes.
PLAYWRIGHT_MCP_VERSION=0.0.84
mcp_found=0
for f in "$HOME/.claude.json" "$HOME/.claude/settings.json" "$PWD/.mcp.json" "$PWD/.claude/settings.json"; do
  if [ -f "$f" ] && grep -q '@playwright/mcp' "$f" 2>/dev/null; then mcp_found=1; break; fi
done
if [ "$mcp_found" = 1 ]; then ok "Playwright MCP configured"
else bad "Playwright MCP not found in Claude Code config" \
  "claude mcp add playwright --scope user -- npx -y @playwright/mcp@${PLAYWRIGHT_MCP_VERSION} --browser chrome"; fi

free_kb="$(df -Pk "$target" | awk 'NR==2 {print $4}')"
free_gb=$((free_kb / 1024 / 1024))
if [ "$free_gb" -ge 10 ]; then ok "${free_gb} GB free at $target"
else bad "only ${free_gb} GB free at $target (10 GB+ needed; frames take several GB per demo)" \
  "free disk space, or delete approved demos' recordings/frames/ folders"; fi

if command -v say >/dev/null 2>&1; then ok "macOS say (free narration with narrate.py, voiceover timing previews)"
else warn "macOS say not available" "Optional. Voiceover fit is estimated from words per minute and no timing preview is made. For narration use ELEVENLABS_API_KEY or your own voiceover/NN.wav files."; fi

# Never print the key itself, only whether it is set.
if [ -n "${ELEVENLABS_API_KEY:-}" ]; then ok "ELEVENLABS_API_KEY is set (narrate.py can use ElevenLabs)"
else printf '  info  ELEVENLABS_API_KEY not set (optional; narrate.py then uses say or your own recordings)\n'; fi

echo
if [ "$fails" -eq 0 ]; then echo "All required checks passed."
else echo "$fails required check(s) failed. Run the fix commands above, then run doctor.sh again."; fi
[ "$fails" -eq 0 ]
