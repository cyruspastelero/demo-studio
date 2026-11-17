#!/usr/bin/env bash
# Scaffolds a demo folder from the plugin templates:
#   $DEMO_ROOT/<name>/{README,BRIEF,RUN-SHEET,SHOT-LIST,VOICEOVER,PREP,THROWAWAYS}.md, demo.json,
#   handoff.json, tools/, recordings/{raw,frames,scenes,exports}/, recordings/takes.csv
# DEMO_ROOT defaults to ./demos (relative to where you run it).
# Usage: new-demo.sh <name>     (name: lowercase letters, digits and dashes)
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
name="${1:?usage: new-demo.sh <name>}"
case "$name" in
  *[!a-z0-9-]*|-*|'') echo "new-demo: name must be lowercase letters, digits and dashes: $name" >&2; exit 1 ;;
esac
root="${DEMO_ROOT:-./demos}"
dir="$root/$name"
[ -e "$dir" ] && { echo "new-demo: $dir already exists" >&2; exit 1; }
mkdir -p "$dir/recordings/raw" "$dir/recordings/frames" "$dir/recordings/scenes" "$dir/recordings/exports" "$dir/tools" "$dir/assets"
for f in README BRIEF RUN-SHEET SHOT-LIST VOICEOVER PREP THROWAWAYS; do
  sed "s/<demo-name>/$name/g" "$here/templates/$f.md" > "$dir/$f.md"
done
cp "$here/templates/demo.json" "$here/templates/handoff.json" "$dir/"
cp "$here/templates/_project.js" "$dir/recordings/scenes/_project.js"
echo "file,scene,take,duration_s,resolution,fps,recorded_at,status,notes" > "$dir/recordings/takes.csv"
printf '.rx-token\nframes/\nexports/.keynote/\neditor-handoff/\nvoice-cache/\n*.zip\n' > "$dir/recordings/.gitignore"
printf '.browser-*/\n.env\napp/.env\n' > "$dir/.gitignore"
echo "scaffolded $dir"
echo "OUTPUT $dir"
