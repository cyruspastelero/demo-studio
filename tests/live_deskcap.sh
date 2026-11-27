#!/usr/bin/env bash
# Live desktop recording check on a real app: a new TextEdit document is sized to 1440x810 and recorded
# while deskcap glides the pointer, clicks and types; then the take is encoded and checked.
# Needs Screen Recording and Accessibility for the terminal (deskcap check). It moves your real pointer
# and types into TextEdit for about 10 seconds: don't touch the mouse or keyboard while it runs.
# Cleans up after itself: closes the document it made (unsaved) and quits TextEdit if it started it.
# Usage: bash tests/live_deskcap.sh [keep-dir]
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
bin="$(bash "$root/scripts/desktop/build.sh")"
fail() { echo "FAIL: $*" >&2; exit 1; }

perms="$("$bin" check)"
[[ "$perms" == *'"accessibility":true'* && "$perms" == *'"screenRecording":true'* ]] \
  || fail "permissions missing. Run: $bin setup   (it opens the right Settings pages and says what to turn on)"

work="${1:-$(mktemp -d)}"
mkdir -p "$work/frames" && cd "$work"
take=frames/_tmp01
[ ! -e "$take" ] || fail "$work/$take already exists"

title="deskcap-live-$$"
was_running=0
pgrep -xq TextEdit && was_running=1
recorder=""
cleanup() {
  if [ -n "$recorder" ] && kill -0 "$recorder" 2>/dev/null; then "$bin" stop "$take" >/dev/null 2>&1 || kill "$recorder"; wait "$recorder" 2>/dev/null || true; fi
  osascript -e "tell application \"TextEdit\" to close (every document whose name is \"$title\") saving no" >/dev/null 2>&1 || true
  [ "$was_running" = 1 ] || osascript -e 'tell application "TextEdit" to quit' >/dev/null 2>&1 || true
}
trap cleanup EXIT

# A fresh, named, unsaved document so we only ever touch our own window.
osascript >/dev/null <<OSA
tell application "TextEdit"
  activate
  set d to make new document
  set name of d to "$title"
end tell
OSA
sleep 1.5
"$bin" prep --app TextEdit --title "$title" > prep.json
"$bin" shot --app TextEdit --title "$title" scout.png >/dev/null
[ "$(sips -g pixelWidth "$PWD/scout.png" | awk '/pixel/ {print $2}')" = 2880 ] || fail "shot must be 2x (2880 px wide)"

"$bin" record --app TextEdit --title "$title" --out "$take" --max-seconds 30 > record.json &
recorder=$!
for _ in $(seq 100); do [ -e "$take/f00000.jpg" ] && break; kill -0 "$recorder" 2>/dev/null || fail "record exited early"; sleep 0.1; done
[ -e "$take/f00000.jpg" ] || fail "no first frame after 10 s"
sleep 1
"$bin" move --app TextEdit --title "$title" 720 400
sleep 0.3
"$bin" click --app TextEdit --title "$title"
sleep 0.4
"$bin" type --app TextEdit --title "$title" -- "Recorded outside the browser by deskcap."
"$bin" blur "$take" 60 40 300 30 >/dev/null
"$bin" move --app TextEdit --title "$title" 1100 600
sleep 1
"$bin" stop "$take" >/dev/null
wait "$recorder" || fail "record exited with an error"
recorder=""

"$bin" find --app TextEdit --title "$title" "outside the browser" > find.json \
  || fail "find did not locate the typed text through Accessibility"

python3 -I - record.json "$take" find.json <<'PY'
import json, pathlib, sys
result = json.load(open(sys.argv[1]))
take = pathlib.Path(sys.argv[2])
found = json.load(open(sys.argv[3]))
assert result["frames"] >= 30, f"too few frames: {result}"
assert result["warnings"] == [], f"warnings: {result['warnings']}"
assert abs(result["window"]["w"] - 1440) <= 1 and abs(result["window"]["h"] - 810) <= 1, f"window not 1440x810: {result['window']}"
assert result["fps"] >= 10, f"effective fps too low: {result['fps']}"
assert len(list(take.glob("f*.jpg"))) == result["frames"]
assert found[0]["w"] > 0 and len(found[0]["rect"]) == 4, found
print(f"recorded {result['frames']} frames in {result['seconds']}s ({result['fps']} fps while moving), {result['dropped']} dropped")
PY
[ "$(sips -g pixelWidth -g pixelHeight "$PWD/$take/f00000.jpg" | awk '/pixel/ {print $2}' | tr '\n' x)" = "2880x1620x" ] \
  || fail "frames must be 2880x1620"

bash "$root/scripts/encode-take.sh" "$take" 01-live "deskcap live test"
python3 -I "$root/scripts/tile-frames.py" frames/01-live-t1 0 9999 sheet.png every=12 >/dev/null
echo "live_deskcap: ok ($work/raw/01-live-t1.mp4, contact sheet $work/sheet.png)"
