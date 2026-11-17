#!/usr/bin/env bash
# Look templates end to end on the todo sample (real raw takes, real Chrome):
#  1. build it with no template, then with "template": "house"; the plan and timing sidecars must be
#     identical (house is the default look, so naming it changes nothing)
#  2. the built-in house template validates (schema, folder, previews)
#  3. the copier measures our own house cut and finds the house window, zoom and pill
# Needs ffmpeg, node with playwright-core and Chrome. Heavy: two keynote builds (the second reuses the
# first one's graphics cache). On a shared laptop run it through the heavy-job lock.
# Usage: bash tests/smoke-templates.sh     (KEEP=1 keeps the temp folder)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
S="$ROOT/scripts"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/demo-studio-templates.XXXXXX")"
cleanup() { if [ "${KEEP:-0}" = 1 ]; then echo "kept $TMP"; else command rm -rf "$TMP"; fi; }
trap cleanup EXIT
ok() { printf '  ok  %s\n' "$1"; }
die() { printf '  FAIL %s\n' "$1" >&2; exit 1; }

D="$TMP/demos/todo-sample"
mkdir -p "$TMP/demos"
cp -R "$ROOT/examples/todo-sample" "$D"
command rm -rf "$D/recordings/exports"
CUT="$D/recordings/exports/todo-app-sample-keynote-cut"

printf '\n== build without a template\n'
(cd "$D" && python3 -I "$S/build-keynote.py" demo.json | grep -v '^PROGRESS' | tail -2)
cp "$CUT.plan.json" "$TMP/plan-default.json"; cp "$CUT.timing.json" "$TMP/timing-default.json"
cp "$CUT.mp4" "$TMP/default.mp4"
ok "default build"

printf '\n== build with "template": "house"\n'
python3 -I - "$D/demo.json" <<'EOF'
import json, sys
path = sys.argv[1]
cfg = json.load(open(path))
cfg["template"] = "house"
open(path, "w").write(json.dumps(cfg, indent=2) + "\n")
EOF
(cd "$D" && python3 -I "$S/build-keynote.py" demo.json | grep -v '^PROGRESS' | grep -E 'template:|OUTPUT')
python3 -I - "$TMP/plan-default.json" "$CUT.plan.json" "$TMP/timing-default.json" "$CUT.timing.json" <<'EOF' || die "house plan differs from the default plan"
import json, sys
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
assert b.pop("template") == "house", "plan.json should name the template"
assert a == b, [k for k in a if a.get(k) != b.get(k)]
assert json.load(open(sys.argv[3])) == json.load(open(sys.argv[4])), "timing differs"
print("  ok  plan.json and timing.json identical to the default build (apart from the template id)")
EOF

printf '\n== built-in house template\n'
python3 -I "$S/templates.py" validate house || die "house template invalid"
python3 -I "$S/templates.py" list | grep -q '^house ' || die "list misses house"
ok "list shows house"

printf '\n== copier on our own house cut\n'
python3 -I "$S/template-from-video.py" "$TMP/default.mp4" --name "Smoke house" --out "$TMP/demos/_templates" \
  --work "$TMP/work" | grep -v '^PROGRESS'
python3 -I - "$TMP/demos/_templates" "$TMP/work/measurements.json" <<'EOF' || die "copier did not find the house look"
import json, sys
from pathlib import Path
folder = next(Path(sys.argv[1]).iterdir())
t = json.load(open(folder / "template.json"))
meas = json.load(open(sys.argv[2]))
look = t["look"]
assert all(abs(a - b) <= 4 for a, b in zip(look["window"]["rect"], [180, 100, 1560, 800])), look["window"]
assert abs(look["zoom"]["scale"] - 1.15) <= 0.01, look["zoom"]
assert abs(look["zoom"]["dur"] - 1.1) <= 0.1, look["zoom"]
assert abs(look["pill"]["center_y"] - 962) <= 3 and abs(look["pill"]["height"] - 68) <= 2, look["pill"]
assert look["end"]["kind"] == "sweep-logo", look["end"]
assert meas["zoom"]["count"] == 2, meas["zoom"]["count"]
src = json.load(open(folder / "source.json"))
assert set(src) <= {"file", "duration", "sha256", "created", "width", "height", "fps", "tool"}, src
assert not any(p.suffix in {".mp4", ".png", ".jpg"} for p in folder.rglob("*")), "reference media leaked into the template"
print(f"  ok  copier measured window {look['window']['rect']}, zoom {look['zoom']['scale']}x over "
      f"{look['zoom']['dur']}s ({meas['zoom']['curve']['ease_name']}), pill y {look['pill']['center_y']}")
EOF
printf '\nsmoke-templates: all passed\n'
