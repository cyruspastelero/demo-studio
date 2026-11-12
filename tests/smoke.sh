#!/usr/bin/env bash
# End-to-end smoke test on synthetic footage: scaffold, frame receiver, encode, QA sheets, keynote cut,
# review reel, editor handoff (promo + how-to), quick preview, social versions, scene wrappers.
# Needs ffmpeg with libx264, python3 and node. Uses real Chrome for title cards when playwright-core
# and Chrome are installed, else placeholder PNGs. macOS `say` is used when present.
# Usage: bash tests/smoke.sh        (KEEP=1 keeps the temp folder)
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
for f in "$S"/*.py; do python3 -m py_compile "$f"; done; ok "python scripts compile"
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
                   ("examples/acme-invoice-bot/demo.json", "demo"), ("examples/acme-invoice-bot/handoff.json", "handoff")]:
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
jpg_b64="$(ffmpeg -loglevel error -f lavfi -i testsrc2=s=64x36 -frames:v 1 -f image2pipe -c:v mjpeg - | base64 | tr -d '\n')"
curl -sf -X POST "http://127.0.0.1:$PORT/start?take=_tmprx" >/dev/null
for i in 0 1 2; do
  curl -sf -X POST "http://127.0.0.1:$PORT/frame" -H 'content-type: application/json' \
    -d "{\"ts\": 1000.$((i * 4)), \"b64\": \"$jpg_b64\"}" >/dev/null
done
curl -sf -X POST "http://127.0.0.1:$PORT/stop" | grep -q '"frames":3' || die "receiver did not report 3 frames"
kill "$RX_PID" 2>/dev/null || true
exists "$R/frames/_tmprx/ts.txt"; exists "$R/frames/_tmprx/f00002.jpg"
command rm -rf "$R/frames/_tmprx"

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
if (cd "$ROOT" && node -e "require.resolve('playwright-core')" >/dev/null 2>&1) && [ "${SMOKE_NO_CHROME:-0}" != 1 ] && \
   { [ -n "${CHROME_PATH:-}" ] || [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] || command -v google-chrome >/dev/null; }; then
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

step "keynote cut"
K="$R/exports/.keynote"; mkdir -p "$K"
for c in intro outro; do solid_png "$K/card-$c.png" 1920x1080 0xF3F3F6; done
ffmpeg -y -loglevel error -f lavfi -i "color=c=black@0.0:s=1920x1080,format=rgba" -frames:v 1 "$K/cap-01.png"
# A short sequence keeps the test quick; the full example demo.json is schema-checked above.
cat > "$D/demo-short.json" <<'EOF2'
{ "title": "Acme Invoice Bot", "sequence": [
  { "card": "intro", "title": "Invoices from the thread.", "duration": 1.0, "voiceover": "Invoices from the thread." },
  { "scene": "01", "stem": "01-the-thread", "take": 1, "caption": "The deal is agreed in chat.", "trim": [1.0, 3.0] },
  { "scene": "05", "stem": "05-approve", "take": 1, "trim": [0.5, 2.5], "speed": 2, "zoom": [1.6, 1500, 600, 0.2, 0.6] },
  { "card": "outro", "title": "Acme Invoice Bot", "duration": 1.0 } ] }
EOF2
(cd "$D" && python3 -I "$S/build-keynote.py" demo-short.json > "$TMP/keynote.log")
grep -q '^PROGRESS parts 4/4' "$TMP/keynote.log" || die "no PROGRESS lines from build-keynote"; ok "build-keynote prints PROGRESS"
grep -q '^OUTPUT .*acme-invoice-bot-keynote-cut.mp4' "$TMP/keynote.log" || die "no OUTPUT line"; ok "build-keynote prints OUTPUT"
CUT="$R/exports/acme-invoice-bot-keynote-cut.mp4"
exists "$CUT"; size_is "$CUT" 1920x1080; fps_is "$CUT"
(cd "$D" && python3 -I "$S/keynote-handoff.py" demo-short.json >/dev/null)
exists "$D/editor-handoff/SCRIPT.txt"; exists "$D/editor-handoff/VOICEOVER.txt"; exists "$D/acme-invoice-bot-editor-handoff.zip"

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
python3 -I "$S/social-cut.py" "$CUT" "$TMP/cut-9x16.mp4" --aspect 9:16 --fit crop --focus-x 0.4 --zoom 1.2 >/dev/null
size_is "$TMP/cut-9x16.mp4" 1080x1920
if python3 -I "$S/social-cut.py" "$CUT" "$TMP/bad.mp4" --aspect 1:1 2>/dev/null; then die "bad aspect accepted"; fi
ok "bad aspect rejected"

step "cardboard timeline (optional path; the script needs no Cardboard)"
(cd "$D" && python3 -I "$S/cardboard-timeline.py" handoff.json PROMO > "$TMP/cardboard.log")
exists "$H/cardboard/PROMO.timeline.tsx"; exists "$H/cardboard/PROMO.narration.json"
grep -q '01_scene1_the-deal-is-in-chat.mp4' "$H/cardboard/PROMO.timeline.tsx" || die "timeline lacks the first clip"
if grep -q 'ROUGH-ASSEMBLY' "$H/cardboard/PROMO.timeline.tsx"; then die "timeline includes the rough assembly"; fi
ok "timeline lists the numbered clips only"
python3 -I -c 'import json,sys; plan=json.load(open(sys.argv[1])); assert plan and all(e["window"] > 0 and e["text"] for e in plan), plan' \
  "$H/cardboard/PROMO.narration.json" || die "narration plan is empty or has a line with no room"
ok "narration plan has a window for every line"
if (cd "$D" && python3 -I "$S/cardboard-timeline.py" handoff.json NOPE >/dev/null 2>&1); then die "unknown video key accepted"; fi
ok "cardboard-timeline rejects an unknown video"

step "starter kit"
python3 -I "$ROOT/tests/test_check.py" 2>/dev/null || die "check.py unit tests"; ok "check.py unit tests"
python3 -I "$ROOT/tests/test_cardboard_timeline.py" 2>/dev/null || die "cardboard-timeline unit tests"; ok "cardboard-timeline unit tests"
bash "$S/new-workspace.sh" "$TMP/ws" >/dev/null
for f in AGENTS.md CLAUDE.md README.md check.py .gitignore; do exists "$TMP/ws/$f"; done
echo "mine" > "$TMP/ws/AGENTS.md"; bash "$S/new-workspace.sh" "$TMP/ws" >/dev/null
[ "$(cat "$TMP/ws/AGENTS.md")" = "mine" ] || die "new-workspace overwrote AGENTS.md"; ok "new-workspace keeps existing files"
python3 -I "$TMP/ws/check.py" >/dev/null || die "check.py fails on a fresh workspace"; ok "check.py passes on a fresh workspace"
DEMO_ROOT="$TMP/ws" bash "$S/new-demo.sh" orphan >/dev/null
if python3 -I "$TMP/ws/check.py" >"$TMP/check.log"; then die "check.py missed a demo that is not in the index"; fi
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
