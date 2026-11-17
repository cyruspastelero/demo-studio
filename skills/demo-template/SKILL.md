---
name: demo-template
description: Make, check and use look templates. Copies the look of an existing video into a reusable template (measures it frame by frame, fills the rest by eye, renders the todo sample in it and compares side by side until it matches), lists the templates there are, and sets a template on a demo. Use when the user says "copy the look of <video>", "make a template from <video>", "use template <id>", or asks which looks exist.
---

# Demo template

A look template is a folder of measurements: window size and corners, zoom scale and easing, pill
and highlight style, title type, background colours, ending, loudness. It never holds the reference
video, its logos, its words or its music. A demo uses one by setting `"template": "<id>"` in
demo.json. Full reference: `$P/docs/templates.md`.

Do not ask the user anything here. Decide, and write each decision in the template's README.md.
Stop only for the stops in skill `demo-studio`, plus one: **only copy a look the user may use as a
reference** (their own video, their company's, or one they say they have the right to reference).
If they did not say, ask once: "Is this a video you're allowed to take the look from?"

Start every shell command with this line (it finds the plugin folder):

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(d=$PWD; while [ "$d" != / ] && [ ! -f "$d/.claude-plugin/plugin.json" ]; do d=$(dirname "$d"); done; [ -f "$d/.claude-plugin/plugin.json" ] && echo "$d" || ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
```

Heavy steps (Step 2 and Step 5) run one at a time. On a shared machine wrap them in the heavy-job lock
if the workspace has one.

## Use a template

```bash
python3 -I "$P/scripts/templates.py" list
```

Expected: one line per template, `<id>  workspace|built-in  <name>: <description>`, then
`N template(s).` The built-in `house` is the default look.

To use one, add `"template": "<id>"` to the demo's demo.json (top level, next to `title`), then
build as usual (skill `demo-edit`). demo.json's own `brand` (accent, font, logo) still wins.

| If you see | Do this |
| --- | --- |
| `template '<id>' not found` | The message lists the ids it found. Use one of them, or make it (below) |
| `is a symlink; refusing it` | Replace the link with a real copy: `cp -R <source> <demos>/_templates/<id>` |
| `does not match schemas/template.schema.json` | Fix the field it names in `<id>/template.json` |
| `WARN template transitions.cut is 'fade'` | Fine. The engine cuts inside the window; the style is only recorded |

To share a template, zip its folder (`<demos>/_templates/<id>/`). The receiver unzips it into their
own `<demos>/_templates/` and runs `python3 -I "$P/scripts/templates.py" validate <id>`.

## Make a template from a video

Work in the demos workspace (`./demos`, or `$DEMO_ROOT`). Templates go in `./demos/_templates/`.

### Step 1: check the video

```bash
ffprobe -v error -show_entries format=duration:stream=codec_type,width,height,r_frame_rate -of compact "<video>"
```

Expected: a video stream (any size; it is measured at 1920x1080) and usually an audio stream.

### Step 2: measure it

```bash
python3 -I "$P/scripts/template-from-video.py" "<video>" --name "<short name>" --out ./demos/_templates --work "${TMPDIR:-/tmp}/tpl-work"
```

Expected (a 90 s video takes about a minute):

```
template-from-video: <file>: 1920x1080 at 30.0 fps, 95.9s; id <slug>-<6 hex>; scratch ...
scenes: N change(s)
measured: window [x, y, w, h], zooms N at 1.15x over 1.1s, pill y 962, loudness -14 LUFS, end sweep-logo
review: K contact sheet(s) in .../sheets; measurements .../measurements.json
fill by eye: 8 item(s), listed in ./demos/_templates/<id>/README.md
next: python3 -I .../template-validate.py <id> --templates ... --reference ... --measurements ... --work ...
OUTPUT ./demos/_templates/<id>
```

Keep the `next:` line; it is Step 5's command.

| If you see | Do this |
| --- | --- |
| `exists. Pass --force` | Same video measured before. Re-run with `--force` to redo the draft, or use the existing id |
| `measured: window [180, 100, 1560, 800]` but the video has no floating window | Measurement found a UI edge. Fix `window.rect` by eye in Step 4 |
| `zooms 0` | No whole-window zoom found. Look at the sheets: if the video zooms, set `zoom` in Step 4 |
| `no floating window found` in README.md | Full-frame footage. Set `window.rect` to the region the UI fills, `radius` 0, `shadow` "none" |

### Step 3: read the frames, one by one

Open `<work>/measurements.json`. `sheets` says which frame and time each contact-sheet tile holds.
Read every sheet in `<work>/sheets/` with the Read tool, then the single frames in `<work>/frames/`
that the sheets point to (title cards, the first window, a zoom at full size, a pill, a highlight, the
end card, the last frame). Check each automatic number against what you see:

| Measured | Check by eye |
| --- | --- |
| `window.rect`, `window.radius` | The window's edges and corners in a rest frame |
| `zoom.curve.per_frame` | Progress 0 to 1 over the move; `ease_name` and `fit_rms` (under 0.03 is a good fit) |
| `pill.center_y`, `pill.height` | A frame with a callout under the window |
| `background.samples`, `fields` | Corners of a title-card frame: do the colours match? |
| `accents` | The first one with a high `share` and low `inside_window` is usually the title accent |
| `loudness` | `integrated` and `true_peak` are the mix targets; `silent_tail` is the outro silence |

### Step 4: fill the rest by eye

Edit `./demos/_templates/<id>/template.json` (shape: `$P/schemas/template.schema.json`). Work through
the "Filled by eye" list in its README.md and tick each item:

1. **Title font.** Compare the title glyphs with Inter and Geist. Inter: a two-storey `a`, `t` with a
   slanted top cut, `R` with a straight leg, `G` with a spur. Geist: a single-storey-looking compact
   `a`, flat terminals, a geometric `G` without a spur. Pick the closer one for `title.font`; we
   only ship these two. Note the real font's name in README.md if you recognise it.
2. **Title size, weight, tracking.** In a title frame, measure the cap height of a capital letter in
   px (frames are 1280x720 here: multiply by 1.5). `title.size` = cap height / 0.727. Weight: 400
   regular, 500 medium, 600 semibold, by stroke thickness. Tracking: tight titles are about -3% of
   the size (`-4` at 132 px).
3. **Title reveal.** Read the frames 0.0, 0.5, 1.0 s into a title: words appear one by one with blur
   -> `word-blur`; whole title fades -> `fade`; already there -> `none`. One word in another
   colour -> `accent_word: true`.
4. **Pill and highlight.** Pill fully round -> `radius: 999`; else the corner px. `font_size` = text
   cap height / 0.727. Person pills have an avatar circle; statement pills are text only. Highlight
   boxes: `stroke` px, `radius` px, `pad` [x, y] between box and UI, `delay` seconds after the zoom
   lands (count frames / fps), `fill_alpha` and `halo_alpha` (0 when there is none).
5. **Brand colours.** `ink` and `secondary` from title and subtitle text; `sweep` from the outro's
   gradient band ends; `dark` from the field behind the logo. Leave out what the video does not have.
6. **Shadow.** No visible shadow -> `"none"`. Otherwise keep the house shadow or soften its alphas.
7. **Ending.** Gradient sweep then logo on dark -> `sweep-logo`; ends on a light card -> `card`;
   just stops -> `none`. `end.seconds`: how long the end card holds before the outro.
8. **name and description.** One line each, about the look, never naming the product or company.

Then:

```bash
python3 -I "$P/scripts/templates.py" show <id> --demo-dir ./demos/x
```

Expected: `<id> (workspace) ...` and the merged look. Any schema error names the field to fix.

### Step 5: validate against the reference, repeat until close

Run the `next:` command from Step 2 (it builds the todo sample in the template; heavy, a few minutes):

```bash
python3 -I "$P/scripts/template-validate.py" <id> --templates ./demos/_templates --reference "<video>" --measurements "<work>/measurements.json" --work "<work>/validate" --check
```

Expected: six `compare NN <moment>: reference Xs | ours Ys -> .../compare/NN-<moment>.png` lines
(hero, rest, zoom, pill, end_card, outro), the check-cut checklist, `OUTPUT .../compare`.

Read each `compare/NN-*.png` (reference left, ours right) and compare: window position and corners,
zoom size, pill height and place, box style, title size and weight, background tint, the ending.
Change the template value that differs, then run Step 5 again. Stop when every pair matches at a
glance and the checklist shows no FAIL except E6/A-rows (the validation cut has no narration).

| If you see | Do this |
| --- | --- |
| `(no reference time: pass --at pill=SECONDS)` | The copier did not find that moment. Find it in the sheets and pass `--at <moment>=<seconds>` |
| A pair shows different moments | Pass `--at` with the right reference time |
| `FAIL W1` or `FAIL Z2-Z3` | `window.rect` or `zoom.scale` is off: re-measure in the rest and zoom frames |
| `build-keynote.py failed` | Read the error above it; usually a value out of range in template.json |

### Step 6: save the previews and finish

```bash
python3 -I "$P/scripts/template-validate.py" <id> --templates ./demos/_templates --work "<work>/validate" --save-previews
python3 -I "$P/scripts/templates.py" validate <id>
```

Expected: `previews: 6 frames ... -> .../preview`, then `ok <id>: schema valid, folder complete`.
The previews are frames of the todo sample in the new look, never the reference.

Delete the scratch folder (`<work>`) when done: it holds the reference's frames.

## Done when

- [ ] `templates.py validate <id>` prints `ok`
- [ ] README.md has every "Filled by eye" box ticked and the decisions written down
- [ ] The six compare pairs match at a glance; the checklist has no FAIL beyond the audio rows
- [ ] `source.json` holds only file name, duration, sha256, size, date; the folder holds no video,
      audio, logo or text from the reference
- [ ] Told the user the id and how to use it: `"template": "<id>"` in demo.json
