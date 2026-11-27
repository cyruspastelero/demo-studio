#!/usr/bin/env bash
# Recipe: one scene in a desktop app (outside the browser, macOS), recorded with deskcap. See docs/desktop.md.
# USE WHEN: the product is a native app (Electron, a macOS app, a simulator window), not a web page.
# CHANGE: every line marked "# CHANGE:". Copy to <demo>/recordings/scenes/<NN-name>.scene.sh and run it
# from <demo>/recordings in ONE command: P="$P" bash scenes/<NN-name>.scene.sh
# It records frames/_tmpNN with the house hand cursor drawn in, prints the take result, and writes
# scout/<NN-name>.json (crop region and highlight targets in 1080p take px) for the edit.
# Don't touch the mouse or keyboard while it runs: it moves the real pointer and types for real.
set -euo pipefail
P="${P:?set P to the plugin folder first}"
D="$(bash "$P/scripts/desktop/build.sh")"
APP="Notes"            # CHANGE: the app name exactly as `deskcap windows` shows it
SCENE="01-new-note"    # CHANGE: this scene's NN-name
TAKE="frames/_tmp01"   # CHANGE: _tmpNN with this scene's number
mkdir -p frames scout

# 1. Before recording: bring the app forward and look up every control the scene uses (a lookup
#    takes time, so never do it on camera). `one` fails unless exactly one control matches.
"$D" prep --app "$APP" >/dev/null
one() {
  "$D" find --app "$APP" "$1" | python3 -I -c '
import json, sys
m = json.load(sys.stdin)
if len(m) != 1:
    sys.exit(f"{len(m)} controls match {sys.argv[1]!r}: {[x[\"label\"] for x in m]}; use a longer label or --role")
print(json.dumps(m[0]))' "$1"
}
NEW="$(one "New Note")"        # CHANGE: one line per control, by its visible label
xy() { python3 -I -c 'import json,sys; m=json.loads(sys.argv[1]); print(int(m["cx"]), int(m["cy"]))' "$1"; }

# 2. Record. Wait for the first frame so the still head is really on camera.
"$D" move --app "$APP" 1000 500 --steps 8   # CHANGE: a resting spot off the content
"$D" record --app "$APP" --out "$TAKE" --max-seconds 60 >"$TAKE.json" &
recorder=$!
trap 'if kill -0 "$recorder" 2>/dev/null; then "$D" stop "$TAKE" >/dev/null || true; wait "$recorder" || true; fi' EXIT
for _ in $(seq 100); do
  [ -e "$TAKE/f00000.jpg" ] && break
  kill -0 "$recorder" 2>/dev/null || { wait "$recorder"; exit 1; }   # record failed: its error is above
  sleep 0.1
done
[ -e "$TAKE/f00000.jpg" ] || { echo "no frame after 10 s" >&2; exit 1; }
T0="$(python3 -I -c 'import time; print(time.time())')"
since() { python3 -I -c 'import sys, time; print(round(time.time() - float(sys.argv[1]), 2))' "$T0"; }
sleep 1.2                                    # still head

# 3. The scene. CHANGE: the steps. Each control comes from step 1.
read -r x y < <(xy "$NEW")
"$D" move --app "$APP" "$x" "$y"
sleep 0.35 && "$D" click --app "$APP"
sleep 0.6
"$D" type --app "$APP" -- "Ideas for the launch\nShort video, one screen at a time."   # CHANGE: the text
NEW_T="$(since)"                             # when the result is on screen, for zooms and highlights
# "$D" blur "$TAKE" 900 300 240 40           # CHANGE: blur a secret box from here on, if the scene shows one
"$D" move --app "$APP" 1000 500              # park off the content
sleep 1.5                                    # still tail

"$D" stop "$TAKE" >/dev/null
wait "$recorder"
trap - EXIT
cat "$TAKE.json"

# 4. Scout file for the edit (skill demo-record, "Desktop apps" step 6). CHANGE: one entry per target in
#    this scene's Edit plan row; "region" is the window area the cut crops to.
python3 -I - "$SCENE" "$NEW" "$NEW_T" "$TAKE/layout.json" <<'PY'
import json, sys
scene, new, new_t = sys.argv[1], json.loads(sys.argv[2]), float(sys.argv[3])
L = json.load(open(sys.argv[4]))
k = 1920 / 2880  # frame px -> 1080p take px
window = [round(v * k, 1) for v in (L["offsetX"], L["offsetY"], L["windowWidth"] * L["scale"], L["windowHeight"] * L["scale"])]
scout = {
    "take": 1,
    "region": {"rect": window, "t": 1.2},  # CHANGE: a tighter area of the window if the cut should crop in
    "new_note": {"rect": new["rect"], "focus": new["focus"], "t": new_t},
}
json.dump(scout, open(f"scout/{scene}.json", "w"), indent=1)
print(f"scout/{scene}.json written")
PY
