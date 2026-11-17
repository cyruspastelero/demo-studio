#!/usr/bin/env bash
# End-to-end smoke test on synthetic footage: scaffold, frame receiver, encode, QA sheets, keynote cut,
# narration, review reel, editor handoff (promo + how-to), quick preview, social versions, scene wrappers.
# Needs ffmpeg with libx264, python3 and node. Uses real Chrome for title cards when playwright-core
# and Chrome are installed, else placeholder PNGs. macOS `say` is used when present.
# Usage: bash tests/smoke.sh        (KEEP=1 keeps the temp folder)
# On a shared laptop run it through the heavy-job lock: one render at a time.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
S="$ROOT/scripts"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/demo-studio-smoke.XXXXXX")"
cleanup() { if [ "${KEEP:-0}" = 1 ]; then echo "kept $TMP"; else command rm -rf "$TMP"; fi; }
trap cleanup EXIT

pass=0
step() { printf '\n== %s\n' "$1"; }
ok() { pass=$((pass + 1)); printf '  ok  %s\n' "$1"; }
die() { printf '  FAIL %s\n' "$1" >&2; exit 1; }
exists() { [ -s "$1" ] || die "missing $1"; ok "exists ${1#$TMP/}"; }
size_is() {  # file expected-WxH
  local got; got="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$1")"
  [ "$got" = "$2" ] || die "$1 is $got, expected $2"; ok "${1#$TMP/} is $2"
}
fps_is() {
  local got; got="$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$1")"
  [ "$got" = "30/1" ] || die "$1 runs at $got fps, expected 30/1"; ok "${1#$TMP/} is 30fps"
}
synthetic() {  # out seconds: a mostly still UI-like frame with one moving block, cheap to encode
  ffmpeg -y -loglevel error -f lavfi -i "color=c=0xF3F3F6:s=1920x1080:r=30:d=$2" \
    -f lavfi -i "testsrc=s=320x180:r=30:d=$2" -filter_complex "[0:v][1:v]overlay=x='200+t*80':y=300" \
    -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -r 30 -movflags +faststart "$1"
}
solid_png() {  # out WxH colour
  ffmpeg -y -loglevel error -f lavfi -i "color=c=$3:s=$2" -frames:v 1 "$1"
}

for tool in ffmpeg ffprobe python3 node; do command -v "$tool" >/dev/null || die "$tool not installed"; done
ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264 || die "ffmpeg lacks libx264"

step "syntax"
for f in "$S"/*.py "$S"/keynote/*.py "$S"/narration/*.py; do python3 -m py_compile "$f"; done; ok "python scripts compile"
for f in "$S"/*.mjs "$ROOT"/app/server/*.mjs "$ROOT"/app/bin/*.mjs "$ROOT"/app/scripts/*.mjs; do node --check "$f"; done; ok "node scripts parse"
for f in "$S"/*.sh "$ROOT"/tests/*.sh; do bash -n "$f"; done; ok "shell scripts parse"

step "schemas"
python3 -I - "$S" "$ROOT" <<'EOF' || die "schema check"
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("demolib", Path(sys.argv[1]) / "demolib.py")
lib = importlib.util.module_from_spec(spec); spec.loader.exec_module(lib)
root = Path(sys.argv[2])
for name, kind in [("templates/demo.json", "demo"), ("templates/handoff.json", "handoff"),
                   ("examples/acme-invoice-bot/demo.json", "demo"), ("examples/acme-invoice-bot/handoff.json", "handoff"),
                   ("examples/todo-sample/demo.json", "demo"), ("examples/todo-sample/handoff.json", "handoff")]:
    errors = lib.validate(json.loads((root / name).read_text()), kind)
    assert not errors, (name, errors)
bad = {"title": "x", "videos": [{"key": "promo", "scenes": [{"name": "a", "shots": [{"source": "a.mp4", "in": 0}]}]}], "extra": 1}
errors = lib.validate(bad, "handoff")
assert any("unknown field 'extra'" in e for e in errors), errors
assert any("videos[0].key" in e for e in errors), errors
print("  ok  templates and example validate; bad config rejected with", len(errors), "errors")
EOF
pass=$((pass + 1))

step "scaffold"
DEMO_ROOT="$TMP/demos" bash "$S/new-demo.sh" acme >/dev/null
D="$TMP/demos/acme"
for f in README BRIEF RUN-SHEET SHOT-LIST VOICEOVER PREP THROWAWAYS; do exists "$D/$f.md"; done
exists "$D/recordings/scenes/_project.js"; exists "$D/recordings/takes.csv"
if DEMO_ROOT="$TMP/demos" bash "$S/new-demo.sh" acme 2>/dev/null; then die "new-demo overwrote an existing demo"; fi
ok "new-demo refuses an existing folder"
cp "$ROOT/examples/acme-invoice-bot/demo.json" "$ROOT/examples/acme-invoice-bot/handoff.json" "$D/"
R="$D/recordings"

step "frame receiver"
PORT=$((20000 + RANDOM % 20000))
(cd "$R" && DEMO_RX_PORT=$PORT DEMO_MIN_FREE_GB=0 node "$S/frame-receiver.mjs" . >"$TMP/rx.log" 2>&1) &
RX_PID=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do curl -s "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.3; done
RX_TOKEN="$(python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$R/.rx-token" "$PORT")" \
  || die "receiver wrote no token to .rx-token"
[ "$(stat -f %Lp "$R/.rx-token" 2>/dev/null || stat -c %a "$R/.rx-token")" = 600 ] || die ".rx-token is not mode 600"; ok ".rx-token is private"
rx() { curl -sf -X POST -H "x-rx-token: $RX_TOKEN" "$@"; }
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/start?take=tmprx")"
[ "$code" = 403 ] || die "receiver accepted a request without its token ($code)"; ok "receiver refuses requests without the token"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "x-rx-token: $RX_TOKEN" -H 'Origin: https://evil.example' "http://127.0.0.1:$PORT/start?take=tmprx")"
[ "$code" = 403 ] || die "receiver accepted a request from a web page ($code)"; ok "receiver refuses requests with an Origin"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "x-rx-token: $RX_TOKEN" "http://127.0.0.1:$PORT/start?take=..")"
[ "$code" = 400 ] || die "receiver accepted take '..' ($code)"; ok "receiver refuses take '..'"
jpg_b64="$(ffmpeg -loglevel error -f lavfi -i testsrc2=s=64x36 -frames:v 1 -f image2pipe -c:v mjpeg - | base64 | tr -d '\n')"
rx "http://127.0.0.1:$PORT/start?take=tmprx" >/dev/null
for i in 0 1 2; do
  rx "http://127.0.0.1:$PORT/frame" -H 'content-type: application/json' \
    -d "{\"ts\": 1000.$((i * 4)), \"b64\": \"$jpg_b64\"}" >/dev/null
done
rx "http://127.0.0.1:$PORT/blur" -d '{"x": 10, "y": 10, "w": 50, "h": 20, "t": 1000.5}' >/dev/null || die "receiver refused a valid blur box"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "x-rx-token: $RX_TOKEN" -d '{"x": "0);evil", "y": 1, "w": 1, "h": 1, "t": 1}' "http://127.0.0.1:$PORT/blur")"
[ "$code" = 400 ] || die "receiver accepted a non-numeric blur box ($code)"; ok "receiver refuses a non-numeric blur box"
rx "http://127.0.0.1:$PORT/stop" | grep -q '"frames":3' || die "receiver did not report 3 frames"
kill "$RX_PID" 2>/dev/null || true
exists "$R/frames/tmprx/ts.txt"; exists "$R/frames/tmprx/f00002.jpg"; exists "$R/frames/tmprx/blur.jsonl"
command rm -rf "$R/frames/tmprx"

step "encode-take (synthetic frames, with a blur box)"
F="$R/frames/_tmp08"; mkdir -p "$F"
ffmpeg -y -loglevel error -f lavfi -i "testsrc2=s=1440x810:r=30:d=2" -start_number 0 -q:v 3 "$F/f%05d.jpg"
python3 - "$F" <<'EOF'
import json, sys
from pathlib import Path
d = Path(sys.argv[1]); n = len(list(d.glob("f*.jpg"))); t0 = 1_700_000_000.0
(d / "ts.txt").write_text("\n".join(f"{t0 + i / 30:.4f}" for i in range(n)) + "\n")
(d / "end.txt").write_text(f"{t0 + n / 30 + 0.5:.4f}")
(d / "blur.jsonl").write_text(json.dumps({"x": 100, "y": 100, "w": 300, "h": 40, "t": t0 + 0.5}) + "\n")
EOF
(cd "$R" && bash "$S/encode-take.sh" frames/_tmp08 08-encode-check "synthetic frames" >/dev/null)
exists "$R/raw/08-encode-check-t1.mp4"; size_is "$R/raw/08-encode-check-t1.mp4" 1920x1080; fps_is "$R/raw/08-encode-check-t1.mp4"
grep -q '^raw/08-encode-check-t1.mp4,08-encode-check,1,' "$R/takes.csv" || die "takes.csv row missing"; ok "takes.csv row logged"
[ -d "$R/frames/08-encode-check-t1" ] || die "frames not renamed"; ok "frames kept as 08-encode-check-t1"

step "QA sheets"
python3 -I "$S/tile-frames.py" "$R/frames/08-encode-check-t1" 0 1.5 "$TMP/tiles.png" every=8 >/dev/null
exists "$TMP/tiles.png"
bash "$S/sheet.sh" "$R/raw/08-encode-check-t1.mp4" "$TMP/sheet.png" 0.5 >/dev/null
exists "$TMP/sheet.png"

step "synthetic raw takes for the example"
for take in 01-the-thread-t1 02-install-bot-t1 03-add-key-t1 04-ask-bot-t2 05-approve-t1 06-invoice-in-billing-t1 07-missing-amount-t1; do
  synthetic "$R/raw/$take.mp4" 12
  scene="${take%-t*}"; n="${take##*-t}"
  echo "raw/$take.mp4,$scene,$n,12.0,1920x1080,vfr->30,2026-01-01T00:00,keep,\"synthetic\"" >> "$R/takes.csv"
done
ok "7 synthetic takes logged as keep"

step "title cards"
CARDS="$R/editor-handoff/assets/title-cards"
HAVE_CHROME=0
if (cd "$ROOT" && node -e "require.resolve('playwright-core')" >/dev/null 2>&1) && [ "${SMOKE_NO_CHROME:-0}" != 1 ] && \
   { [ -n "${CHROME_PATH:-}" ] || [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] || command -v google-chrome >/dev/null; }; then
  HAVE_CHROME=1
  (cd "$D" && node "$S/title-cards.mjs" handoff.json --social) | grep -c '^OUTPUT' | xargs -I{} echo "  rendered {} images with headless Chrome"
  size_is "$CARDS/card-open.png" 1920x1080
  size_is "$R/editor-handoff/assets/social-captions/PROMO-4x5-1.png" 1080x250
else
  echo "  (playwright-core or Chrome missing: placeholder cards)"
  mkdir -p "$CARDS" "$R/editor-handoff/assets/social-captions"
  for c in open setup use edge end; do solid_png "$CARDS/card-$c.png" 1920x1080 0xF6F6F8; done
  solid_png "$R/editor-handoff/assets/social-captions/PROMO-4x5-1.png" 1080x250 0x1D1D1F
  ok "placeholder cards made"
fi

if [ "$HAVE_CHROME" = 1 ]; then
step "keynote cut (quality-bar engine: title, callout, zoom, highlight, end card)"
# A short sequence keeps the test quick; the full example demo.json is schema-checked above.
cat > "$D/demo-short.json" <<'EOF2'
{ "title": "Acme Invoice Bot", "sequence": [
  { "card": "intro", "kind": "hero", "title": "Invoices from the thread.", "accent": "thread.", "subtitle": "Acme", "duration": 2.4,
    "voiceover": "Invoices from the thread." },
  { "scene": "01", "stem": "01-the-thread", "take": 1, "trim": [1.0, 5.0], "crop": [160, 150, 1400, 718],
    "callouts": [{ "at": 0.76, "dur": 3.0, "kind": "statement", "text": "The deal is agreed." }] },
  { "scene": "05", "stem": "05-approve", "take": 1, "trim": [0.5, 6.5], "crop": [160, 150, 1400, 718],
    "zooms": [{ "at": 0.5, "focus": [700, 420], "dur": 2.5 }],
    "highlights": [{ "rect": [600, 400, 240, 40] }], "voiceover": "Approve it." },
  { "card": "outro", "kind": "end", "title": "Acme Invoice Bot", "accent": "Invoice", "subtitle": "acme.example.com", "duration": 3.0, "outro": 3.5,
    "voiceover": "Acme invoice bot." } ] }
EOF2
(cd "$D" && python3 -I "$S/build-keynote.py" demo-short.json > "$TMP/keynote.log" 2>&1) || { cat "$TMP/keynote.log"; die "build-keynote failed"; }
grep -q '^PROGRESS composite' "$TMP/keynote.log" || die "no PROGRESS lines from build-keynote"; ok "build-keynote prints PROGRESS"
grep -q '^OUTPUT .*acme-invoice-bot-keynote-cut.mp4' "$TMP/keynote.log" || die "no OUTPUT line"; ok "build-keynote prints OUTPUT"
grep -q '^fonts: painted .*Inter' "$TMP/keynote.log" || { cat "$TMP/keynote.log"; die "titles not painted in the bundled Inter"; }
ok "titles and pills painted in the bundled Inter"
CUT="$R/exports/acme-invoice-bot-keynote-cut.mp4"
exists "$CUT"; size_is "$CUT" 1920x1080; fps_is "$CUT"
exists "$R/exports/acme-invoice-bot-keynote-cut.timing.json"; exists "$R/exports/acme-invoice-bot-keynote-cut.plan.json"
python3 -I -c 'import json,sys; t=json.load(open(sys.argv[1])); assert [i["key"] for i in t["items"]]==["card-intro","01","05","card-outro"] and abs(t["total"]-18.9)<0.05 and t["outro"]==3.5, t' \
  "$R/exports/acme-invoice-bot-keynote-cut.timing.json" || die "timing file does not match the sequence"
ok "build-keynote writes the timing file (18.9 s, 3.5 s outro)"
python3 -I -c 'import sys; d=float(sys.argv[1]); assert abs(d-18.9)<0.1, d' \
  "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$CUT")" || die "cut is not 18.9 s long"; ok "cut is 18.9 s"
(cd "$D" && python3 -I "$S/keynote-handoff.py" demo-short.json >/dev/null)
exists "$D/editor-handoff/SCRIPT.txt"; exists "$D/editor-handoff/VOICEOVER.txt"; exists "$D/acme-invoice-bot-editor-handoff.zip"
exists "$D/editor-handoff/03-edited-segments/02-05.mp4"

step "narrate (own voice files, so it runs without say or an API key)"
tone() {  # out seconds frequency: a speech-like test line (tone + soft pink noise, 4 syllables a second)
  ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=$3:sample_rate=44100:duration=$2" \
    -f lavfi -i "anoisesrc=color=pink:amplitude=0.08:sample_rate=44100:duration=$2:seed=7" \
    -filter_complex "[0][1]amix=inputs=2,tremolo=f=4:d=0.6" "$1"
}
mkdir -p "$D/voiceover"
NARRATED="$R/exports/acme-invoice-bot-keynote-cut-narrated.mp4"
tone "$D/voiceover/01.wav" 7 440; tone "$D/voiceover/02.m4a" 2.5 660; tone "$D/voiceover/03.wav" 1.6 550
if (cd "$D" && python3 -I "$S/narrate.py" demo-short.json --voice files --dry-run >"$TMP/narrate.log" 2>&1); then
  die "narrate accepted a line that runs long"; fi
grep -q 'line 1 (card-intro) runs 7.0s but has 6.1s' "$TMP/narrate.log" || { cat "$TMP/narrate.log"; die "overrun not reported"; }
ok "narrate reports a line that runs long"
(cd "$D" && python3 -I "$S/narrate.py" demo-short.json --voice files --dry-run --allow-overrun >/dev/null 2>&1) || die "--allow-overrun still failed"
[ -e "$NARRATED" ] && die "dry run wrote a video"; ok "dry run writes no video"
tone "$D/voiceover/01.wav" 4.5 440; python3 -I "$S/make-bed.py" "$TMP/music.m4a" --seconds 20 >/dev/null
(cd "$D" && python3 -I "$S/narrate.py" demo-short.json --voice files --music "$TMP/music.m4a" > "$TMP/narrate.log") \
  || { cat "$TMP/narrate.log"; die "narrate failed"; }
grep -q '^OUTPUT .*keynote-cut-narrated.mp4' "$TMP/narrate.log" || die "no OUTPUT from narrate"; ok "narrate prints OUTPUT"
grep -q '^narrate: bed set 13 dB under the narration' "$TMP/narrate.log" || die "bed not levelled under the voice"; ok "bed levelled 13 dB under the voice"
exists "$NARRATED"; size_is "$NARRATED" 1920x1080
video_md5() { ffmpeg -loglevel error -i "$1" -map 0:v -c copy -f md5 -; }
[ "$(video_md5 "$CUT")" = "$(video_md5 "$NARRATED")" ] || die "video stream was re-encoded"; ok "video stream copied untouched"
python3 -I -c 'import sys; a, b = map(float, sys.argv[1:]); assert abs(a - b) < 0.15, (a, b)' \
  "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$CUT")" \
  "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$NARRATED")" || die "narrated length differs from the cut"
ok "narrated cut is as long as the cut"

step "quality bar (docs/quality-bar.md checklist on the synthetic cut)"
python3 -I "$S/check-cut.py" "$NARRATED" --json "$TMP/bar.json" > "$TMP/bar.log" 2>&1 || true
bar() {  # item description: the checklist line for that item must be PASS
  python3 -I - "$TMP/bar.json" "$1" <<'PYEOF' || { grep -E "^(PASS|FAIL) +$1 " "$TMP/bar.log"; die "$2"; }
import json, sys
rows = [r for r in json.load(open(sys.argv[1])) if r["item"] == sys.argv[2]]
assert rows and all(r["status"] == "PASS" for r in rows), rows
PYEOF
  ok "$2: $(grep -E "^PASS +$1 " "$TMP/bar.log" | head -1 | sed -E 's/^PASS +[^ ]+ +//')"
}
bar E1 "H.264 High"
bar E2 "1920x1080 at 30 fps"
bar E3 "yuv420p tagged BT.709"
bar E4 "video bitrate >= 3.5 Mbps"
bar E5 "keyframe every 2.0 s"
bar E6 "AAC 48 kHz stereo >= 160 kbps"
bar E7 "faststart (moov before mdat)"
bar A2 "loudness -14 +-1 LUFS"
bar A3 "true peak <= -1 dBTP"
bar O1 "frame 0 shows the title, not a blank"
bar W1 "rest window 1560x800 at (180, 100)"
bar W6 "window rises in over 0.7 s"
bar W7 "no background-only frame at the cut"
bar Z2-Z3 "zoom peaks at 1.15x inside the frame"
bar Z4 "zoom eases over 1.1 s"
bar H1-H5 "highlight box 0.17 s after the zoom lands"
bar C1-C2 "callout pill at y 962, 68 px"
bar X2 "brand sweep"
bar T1 "bundled font painted"
else
  echo "  (playwright-core or Chrome missing: keynote cut, narration and the bar check skipped)"
fi

step "review reel"
(cd "$D" && python3 -I "$S/review-reel.py" recordings --config demo.json > "$TMP/reel.log")
exists "$R/exports/review-reel.mp4"; size_is "$R/exports/review-reel.mp4" 1920x1080
head -1 "$R/exports/reel.txt" | grep -q '01-the-thread-t1.mp4' || die "reel not in story order"; ok "reel starts with scene 01"

step "editor handoff (promo + how-to + social)"
SAY_FLAG=""; command -v say >/dev/null || SAY_FLAG="--no-say"
(cd "$D" && python3 -I "$S/build-handoff.py" handoff.json $SAY_FLAG > "$TMP/handoff.log")
grep -q '^voiceover fits' "$TMP/handoff.log" || { cat "$TMP/handoff.log"; die "voiceover does not fit"; }; ok "voiceover fits"
grep -q '^PROGRESS cut-PROMO' "$TMP/handoff.log" || die "no PROGRESS from build-handoff"; ok "build-handoff prints PROGRESS"
H="$R/editor-handoff"
PROMO="$(ls -d "$H"/PROMO_* | head -1)"; HOWTO="$(ls -d "$H"/HOW-TO_* | head -1)"
exists "$PROMO/00_ROUGH-ASSEMBLY.mp4"; size_is "$PROMO/00_ROUGH-ASSEMBLY.mp4" 1920x1080; fps_is "$PROMO/00_ROUGH-ASSEMBLY.mp4"
exists "$HOWTO/00_ROUGH-ASSEMBLY.mp4"
exists "$PROMO/01_scene1_the-deal-is-in-chat.mp4"
for f in 1-READ-ME-FIRST.txt 2-PROMO-SCRIPT.txt 3-PROMO-VOICEOVER.txt 4-HOW-TO-SCRIPT.txt 5-HOW-TO-VOICEOVER.txt assets/brand/BRAND.txt; do exists "$H/$f"; done
exists "$H/source-footage/2-setup/03-add-key-t1.mp4"
exists "$H/reference/take-contact-sheets/04-ask-bot-t2.jpg"
if [ -z "$SAY_FLAG" ]; then exists "$H/reference/PROMO-VOICEOVER-TIMING-PREVIEW.mp4"; fi
size_is "$H/social/PROMO_4x5.mp4" 1080x1350
size_is "$H/social/PROMO_9x16.mp4" 1080x1920
exists "$R/acme-invoice-bot-editor-handoff.zip"
python3 -m zipfile -l "$R/acme-invoice-bot-editor-handoff.zip" | grep -q 'editor-handoff/1-READ-ME-FIRST.txt' || die "zip lacks READ-ME-FIRST"
ok "zip holds READ-ME-FIRST"
EM="$(printf '\342\200\224')"
if grep -q "$EM" "$H"/*.txt; then die "em dash in generated text"; fi; ok "no em dashes in generated text"

step "quick preview (the editor's fast render)"
(cd "$D" && python3 -I "$S/quick-preview.py" handoff.json PROMO > "$TMP/quick.log")
grep -q '^OUTPUT .*PROMO-quick-preview.mp4' "$TMP/quick.log" || die "no OUTPUT from quick-preview"; ok "quick-preview prints OUTPUT"
size_is "$R/exports/PROMO-quick-preview.mp4" 960x540; fps_is "$R/exports/PROMO-quick-preview.mp4"

step "social-cut from the command line"
[ -n "${CUT:-}" ] || CUT="$R/raw/01-the-thread-t1.mp4"
python3 -I "$S/social-cut.py" "$CUT" "$TMP/cut-9x16.mp4" --aspect 9:16 --fit crop --focus-x 0.4 --zoom 1.2 >/dev/null
size_is "$TMP/cut-9x16.mp4" 1080x1920
if python3 -I "$S/social-cut.py" "$CUT" "$TMP/bad.mp4" --aspect 1:1 2>/dev/null; then die "bad aspect accepted"; fi
ok "bad aspect rejected"

step "starter kit"
python3 -I "$ROOT/tests/test_check.py" 2>/dev/null || die "check.py unit tests"; ok "check.py unit tests"
python3 -I "$ROOT/tests/test_narrate.py" 2>/dev/null || die "narrate unit tests"; ok "narrate unit tests"
python3 -I "$ROOT/tests/test_keynote.py" 2>/dev/null || die "keynote engine unit tests"; ok "keynote engine unit tests"
node "$ROOT/tests/test_lib.mjs" >/dev/null || die "lib.js unit tests"; ok "lib.js unit tests"
bash "$S/new-workspace.sh" "$TMP/ws" >/dev/null
for f in AGENTS.md CLAUDE.md README.md check.py .gitignore; do exists "$TMP/ws/$f"; done
echo "mine" > "$TMP/ws/AGENTS.md"; bash "$S/new-workspace.sh" "$TMP/ws" >/dev/null
[ "$(cat "$TMP/ws/AGENTS.md")" = "mine" ] || die "new-workspace overwrote AGENTS.md"; ok "new-workspace keeps existing files"
DEMO_MIN_FREE_GB=0 python3 -I "$TMP/ws/check.py" >/dev/null || die "check.py fails on a fresh workspace"; ok "check.py passes on a fresh workspace"
DEMO_ROOT="$TMP/ws" bash "$S/new-demo.sh" orphan >/dev/null
if DEMO_MIN_FREE_GB=0 python3 -I "$TMP/ws/check.py" >"$TMP/check.log"; then die "check.py missed a demo that is not in the index"; fi
grep -q 'missing from the README index' "$TMP/check.log" || die "check.py did not explain the drift"; ok "check.py reports a demo missing from the index"

step "scene wrappers"
export PLAYWRIGHT_MCP_OUT="$TMP/mcp"
printf 'const p = findTab("example.com");\nreturn { ok: !!p };\n' > "$R/scenes/01-the-thread.body.js"
(cd "$R" && bash "$S/mk-scene.sh" 01-the-thread >/dev/null && bash "$S/mk-scene.sh" 01-the-thread --use-lib >/dev/null && bash "$S/mk-lib.sh" >/dev/null)
DEMO_TIMEZONE=Europe/London bash "$S/mk-setup.sh" https://example.com >/dev/null
grep -q 'timezoneId' "$PLAYWRIGHT_MCP_OUT/scenes/_setup.run.js" || die "timezone not applied"; ok "mk-setup applies DEMO_TIMEZONE"
for f in "$PLAYWRIGHT_MCP_OUT"/scenes/*.run.js; do
  cp "$f" "$TMP/check.js"; node --check "$TMP/check.js" || die "$f does not parse"
done
ok "generated run_code files parse"

printf '\nsmoke test passed (%s checks)\n' "$pass"
