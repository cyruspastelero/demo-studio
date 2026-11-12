---
name: demo-edit
description: Edit recorded demo takes into videos. Builds the review reel of keepers, an Apple-keynote-style cut from demo.json, the promo and how-to cuts from handoff.json (in/out/speed per shot, title cards, voiceover per scene with a fit check and timing preview), and 4:5 or 9:16 social versions. Use after recording, when cutting, re-timing, adding voiceover or making vertical versions of a demo.
---

# Demo edit

`P` is this plugin's root, `${CLAUDE_PLUGIN_ROOT}` (if unfilled, `ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1`).
Run everything from the demo folder. Every render script checks its config against
`$P/schemas/` first and prints `PROGRESS <stage> <done>/<total>` and `OUTPUT <path>` lines.

## 1. Review reel (always first)

```bash
python3 -I "$P/scripts/review-reel.py" recordings --config demo.json
open recordings/exports/review-reel.mp4
```

Joins the `keep` takes from takes.csv uncut, in demo.json story order, and warns about scenes with no
keeper. Show it to the user and agree on the takes before cutting.

## 2. Keynote-style cut (optional, from demo.json)

Floating rounded window on a light background, soft shadow, eased zooms, SF Pro statement captions
and title cards.

```bash
export PLAYWRIGHT_MCP_OUT="$PWD/.playwright-mcp"         # the session cwd, as when recording
python3 -I "$P/scripts/mk-assets.py" demo.json            # then browser_run_code(filename=_assets.run.js)
python3 -I "$P/scripts/build-keynote.py" demo.json        # run_in_background; about 1s CPU per 1s of output
bash "$P/scripts/sheet.sh" recordings/exports/<slug>-keynote-cut.mp4 /tmp/cut.png 12
```

`mk-assets` returns `paintedFonts`, which must include `.SFNS` (San Francisco) on macOS.
Tune per scene in demo.json: `trim: [in, out]` cuts idle time, `speed` (1.25 to 3) makes form filling
brisk, `zoom: [factor, cx, cy, t0, dur]` for hero moments only. Rebuild single parts with
`build-keynote.py demo.json 05 card-intro`.

## 3. Promo and how-to (handoff.json)

Fill `handoff.json` (shape: `$P/schemas/handoff.schema.json`, example: `$P/examples/acme-invoice-bot/handoff.json`):

- `videos`: usually `PROMO` (about 1:30) and `HOW-TO` (about 3:00). Each has `scenes`; each scene has
  a `name`, a `voiceover` line and `shots`.
- A shot is a clip `{source, in, out, speed, screen, text}` from `recordings/raw`, a title card
  `{card, length, text}`, or `{ref: NAME}` reusing a named shot from `shots` (with optional overrides),
  so both videos share in and out points.
- Find in and out points from the contact sheets and the take notes. Cut waits and typing; keep the
  moment the result appears plus about 2s to read it.
- `cards`: the wording for every `card-*` used. `brand`: colours, font, logo, spelling, taglines.
- `parts`: story-part folder name to take prefixes, for source-footage.
- `brief`: summary, people, glossary, edit notes, fixes, do-not-say, claims (fills READ-ME-FIRST).

Title cards (headless Chrome via playwright-core; no demo window needed):

```bash
node "$P/scripts/title-cards.mjs" handoff.json            # add --social for caption bands
```

Then build (demo-handoff covers packaging):

```bash
python3 -I "$P/scripts/build-handoff.py" handoff.json     # --no-say off macOS, --no-social, --no-zip
```

## 4. Voiceover fit check

Rules: `$P/references/voiceover.md`. build-handoff.py measures every line (macOS `say` at
`voice.rate_wpm`, else a words-per-minute estimate) against the time until the next voiced scene and
prints `voiceover fits` or each line that runs long. Fix by cutting words, lowering a shot's `speed`,
or lengthening a card, then rebuild. On macOS it also writes
`reference/<VIDEO>-VOICEOVER-TIMING-PREVIEW.mp4` with a placeholder voice. Listen to it.

## 5. Social versions (4:5 and 9:16)

Add entries to `handoff.json` `social`, built automatically by build-handoff.py, or run directly:

```bash
python3 -I "$P/scripts/social-cut.py" handoff.json
python3 -I "$P/scripts/social-cut.py" recordings/exports/<slug>-keynote-cut.mp4 out-4x5.mp4 --aspect 4:5 --fit crop --focus-x 0.4
```

- `aspect`: `4:5` (1080x1350) or `9:16` (1080x1920).
- `fill`: `blur` (blurred footage behind) or `color` with `color` (a brand hex).
- `fit`: `contain` shows the whole frame; `crop` fills a taller window around `focus_x`/`focus_y`
  (0 to 1) with optional `zoom`, so UI text reads on a phone. Pick the focus from the contact sheets.
- `captions`: `[{start, end, text}]` in a band above the window. If ffmpeg has no `drawtext`
  (doctor.sh says), render the bands first with `title-cards.mjs handoff.json --social`.
- One focus per entry. For a moving focus, cut the source into segments and make one entry each.

## 6. Check before handing off

Watch every rough assembly end to end, check `voiceover fits`, and view a contact sheet of each social
version for cropped-off content.

## 7. Finish in Cardboard (optional)

If the user has Cardboard and wants a finished video with narration, captions and music rather than
a handoff to an editor, continue with the `demo-cardboard` skill. It starts from the clips built in
step 3. Everything above works without it.

## 8. Let a human review or tweak the cut (local editor)

When the user or a coworker wants to watch the cut, nudge in and out points, reorder shots, reword
on-screen text or voiceover, or check the 4:5 and 9:16 framing themselves, suggest the local editor
instead of describing edits in chat:

```bash
npm --prefix "$P" run studio <demo-folder>        # first run: npm install --prefix "$P"
```

It plays the cut live from the raw takes (no render), and its Render menu runs these same scripts.
It reads and writes the same `handoff.json` and `demo.json`, so:

- Re-read both files before you change them; the editor may have saved edits since you last looked.
- Your edits are safe while it is open: it reloads on change, or asks the person which version to
  keep if they have unsaved edits. Keep writing whole, valid files.
- It never writes a file that fails the schema, and keeps `_` keys.
