#!/usr/bin/env bash
# Sets up a demos workspace from the starter kit: AGENTS.md (the playbook), CLAUDE.md, README.md
# (the index), check.py (the drift report) and .gitignore. Existing files are never overwritten.
# Usage: new-workspace.sh [dir]     (default: ./demos)
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
dir="${1:-./demos}"
mkdir -p "$dir"
copy() {  # source-name target-name
  if [ -e "$dir/$2" ]; then echo "  kept   $2 (already there)"
  else /bin/cp "$here/starter/$1" "$dir/$2"; echo "  added  $2"; fi
}
echo "demos workspace at $dir"
copy AGENTS.md AGENTS.md
copy CLAUDE.md CLAUDE.md
copy README.md README.md
copy check.py check.py
copy gitignore .gitignore
echo "Next: cd \"$dir\", start Claude Code there, and ask for a demo."
echo "See every demo and its next step: npm --prefix \"$here\" run studio (from $dir)"
echo "OUTPUT $dir"
