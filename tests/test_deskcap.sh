#!/usr/bin/env bash
# deskcap (desktop recording) without screen permissions: builds it, checks argument and folder errors,
# writes synthetic takes through the real layout, cursor, compositor and writer, and runs them through
# encode-take.sh with blur boxes, for a 16:9 window and a letterboxed 4:3 one. macOS only; skips elsewhere.
# The live check (a real window, real input) is tests/live_deskcap.sh.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$(uname -s)" != Darwin ]; then echo "test_deskcap: skipped (macOS only)"; exit 0; fi

bin="$(bash "$root/scripts/desktop/build.sh")"
work="$(mktemp -d)"
trap 'command rm -rf "$work"' EXIT
cd "$work"
fail() { echo "FAIL: $*" >&2; exit 1; }
expect_error() {  # expect_error "<message part>" args...
  local want="$1"; shift
  local out; if out="$("$bin" "$@" 2>&1)"; then fail "deskcap $* should fail"; fi
  [[ "$out" == *"$want"* ]] || fail "deskcap $*: expected \"$want\", got: $out"
}

# unknown_command_prints_usage_and_exits_2
set +e; "$bin" nonsense >/dev/null; code=$?; set -e
[ "$code" = 2 ] || fail "unknown command exited $code, want 2"

# bad_arguments_are_refused_before_any_permission_check
expect_error "--app is required" record --out x
expect_error "--out is required" record --app Finder
expect_error "--fps must be a number from 1 to 30" record --app Finder --out x --fps 60
expect_error "unknown option --fp" record --app Finder --out x --fp 30
expect_error "--cursor must be hand, arrow or none" record --app Finder --out x --cursor dot
expect_error "--frames must be a number from 1 to 600" selftest frames/a --frames lots
expect_error "--window must look like 1440x810" selftest frames/a --window big
expect_error "missing H" blur . 1 2 3
expect_error "positive size" blur . 1 2 0 4
expect_error "unknown modifier" key hyper+s
expect_error "unknown key" key cmd+nosuchkey
expect_error "--steps must be a number from 1 to 200" move --app Finder 1 1 --steps 0

# folders_are_checked_before_writing
expect_error "does not exist" blur no-such-dir 1 2 3 4
mkdir empty-take && expect_error "has no layout.json" blur empty-take 1 2 3 4
expect_error "no take is recording" stop empty-take
mkdir real && ln -s real linked
expect_error "not a plain folder" selftest linked
mkdir used && touch used/f00000.jpg
expect_error "is not empty" selftest used

# windows_and_check_print_json
"$bin" windows | python3 -I -c 'import json,sys; assert isinstance(json.load(sys.stdin), list)'
"$bin" setup --no-open | python3 -I -c 'import json,sys; d=json.load(sys.stdin); assert {"ready","app","missing","opened","steps"} <= d.keys() and d["opened"] == [] and d["app"], d'
"$bin" check | python3 -I -c 'import json,sys; d=json.load(sys.stdin); assert {"screenRecording","accessibility"} <= d.keys()'

# selftest_writes_the_frame_receiver_take_format
"$bin" selftest frames/_tmp01 --frames 45 --pointer 700,600 > selftest.json
python3 -I -c 'import json; r=json.load(open("selftest.json")); print("  compose + encode:", r["msPerFrame"], "ms per frame")'
[ "$(ls frames/_tmp01/f*.jpg | wc -l | tr -d ' ')" = 45 ] || fail "want 45 frames"
[ -f frames/_tmp01/f00000.jpg ] && [ -f frames/_tmp01/f00044.jpg ] || fail "frame names must be f00000.jpg..f00044.jpg"
[ ! -e frames/_tmp01/ts.partial ] || fail "ts.partial must be renamed to ts.txt when the take finishes"
python3 -I - frames/_tmp01 <<'PY'
import sys, pathlib
d = pathlib.Path(sys.argv[1])
ts = [float(t) for t in (d / "ts.txt").read_text().split()]
end = float((d / "end.txt").read_text())
assert len(ts) == 45 and ts == sorted(ts) and ts[0] > 1.7e9, "ts.txt: 45 rising epoch seconds"
assert end >= ts[-1], "end.txt must not be before the last frame"
PY
expect_error "is not empty" selftest frames/_tmp01

# check_take <dir> <window w> <window h>: blur a stripe box, encode, and measure the 1080p take.
check_take() {
  local dir="$1" scene="$2"
  "$bin" blur "$dir" 100 50 300 150 >/dev/null
  "$bin" blur "$dir" -50 -50 20 20 2>/dev/null && fail "a box fully outside the window must be refused"
  python3 -I - "$dir" <<'PY'
import json, pathlib, sys
d = pathlib.Path(sys.argv[1])
ts = float((d / "ts.txt").read_text().split()[0])
box = json.loads((d / "blur.jsonl").read_text().splitlines()[0])
box["t"] = ts  # the box was added after the synthetic frames; make it cover the whole take
(d / "blur.jsonl").write_text(json.dumps(box) + "\n")
PY
  cp "$dir/layout.json" "$scene.layout.json"
  bash "$root/scripts/encode-take.sh" "$dir" "$scene" "deskcap self test" >/dev/null
  local take="raw/$scene-t1.mp4"
  [ "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$take")" = "1920,1080,30/1" ] \
    || fail "$take must be 1920x1080 at 30fps"
  grep -q "^$take,$scene,1," takes.csv || fail "takes.csv row missing for $scene"
  ffmpeg -v error -ss 0.5 -i "$take" -frames:v 1 -vf format=gray -f rawvideo "$scene.gray"
  python3 -I - "$scene.gray" "$scene.layout.json" <<'PY'
import json, sys
data = open(sys.argv[1], "rb").read()
L = json.load(open(sys.argv[2]))
W, k = 1920, 1920 / 2880  # 1080p px per frame px
def px(wx, wy):  # window point -> 1080p px
    return int((L["offsetX"] + wx * L["scale"]) * k), int((L["offsetY"] + wy * L["scale"]) * k)
def spread(x0, x1, y):
    row = data[y * W + x0: y * W + x1]
    return max(row) - min(row)
# Stripes (window points y 0-250): sharp outside the box, flat inside it (box: x 100-400, y 50-200).
(ix0, iy), (ix1, _) = px(160, 120), px(340, 120)
(ox0, oy), (ox1, _) = px(600, 120), px(780, 120)
inside, outside = spread(ix0, ix1, iy), spread(ox0, ox1, oy)
assert outside > 120, f"stripes should be sharp outside the box (spread {outside})"
assert inside < outside / 3, f"box should be blurred: spread inside {inside}, outside {outside}"
# Letterbox bars are black; the window fills the rest.
if L["offsetX"] > 0:
    bar = data[540 * W + 2: 540 * W + int(L["offsetX"] * k) - 2]
    assert max(bar) < 20, f"left letterbox bar should be black (max {max(bar)})"
# The house hand cursor is drawn at the pointer (window point 700,600): its dark outline is there, and
# not in the same spot without it.
cx, cy = px(700, 600)
patch = [data[y * W + x] for y in range(cy, cy + int(30 * L["scale"] * k)) for x in range(cx - int(14 * L["scale"] * k), cx + int(18 * L["scale"] * k))]
assert min(patch) < 60, f"cursor outline missing near the pointer (darkest {min(patch)})"
assert max(patch) > 245, f"cursor fill missing near the pointer (lightest {max(patch)})"
PY
}

# blur_box_and_cursor_line_up_in_a_16_9_window
check_take frames/_tmp01 01-wide

# blur_box_and_cursor_line_up_in_a_letterboxed_4_3_window
"$bin" selftest frames/_tmp02 --frames 20 --window 1200x900 --pointer 700,600 >/dev/null
python3 -I -c 'import json; L=json.load(open("frames/_tmp02/layout.json")); assert L["scale"] == 1.8 and L["offsetX"] == 360 and L["offsetY"] == 0, L'
check_take frames/_tmp02 02-tall

# no_cursor_when_asked
"$bin" selftest frames/_tmp03 --frames 2 --pointer 700,600 --cursor none >/dev/null
python3 -I - frames/_tmp03/f00000.jpg <<'PY' || fail "--cursor none must not draw a cursor"
import subprocess, sys
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", sys.argv[1], "-vf", "crop=120:120:1360:1200,format=gray", "-f", "rawvideo", "-"],
                     capture_output=True, check=True).stdout
assert min(raw) > 200, f"found dark pixels {min(raw)} where no cursor should be"
PY

echo "test_deskcap: ok"
