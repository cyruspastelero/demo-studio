# Look templates

[Back to the README](../README.md)

A look template is a reusable look for the keynote cut: where the floating window sits and how round
its corners are, how far and how fast the zooms go, what the pills and highlight boxes look like,
the title type and how it reveals, the background colours, the ending, the loudness. A demo picks
one with a single line in demo.json:

```json
{ "title": "Acme invoices", "template": "house", "sequence": [ ... ] }
```

Without `template`, a demo gets the house look ([quality bar](quality-bar.md)), which is also the
built-in template `house`. demo.json's own `brand` (accent, font, logo, colours) always wins over the
template's, so one template serves many products.

## What a template is

A folder named after its id:

```
<id>/
  template.json      the look: schemas/template.schema.json
  README.md          what it is, how it was measured, what was filled by eye
  source.json        provenance of a copied look: file name, duration, sha256, size, date
  preview/01.png..06.png   1280x720 frames of the todo sample drawn in this look
```

- **id**: 3 to 64 lowercase letters, digits and dashes (`^[a-z0-9][a-z0-9-]{2,63}$`). Copied looks
  are named `<slug>-<6 hex>`, the hex being the start of the source file's sha256.
- **template.json**: `id`, `name` and `look` are required; every look value is optional and falls
  back to the house look. Colours are `#hex` only. There are no file paths in it, so a template
  cannot point at anything outside its folder.
- **previews** are found by convention (`preview/01.png` title, `02` window at rest, `03` zoom with a
  highlight, `04` pill, `05` end card, `06` outro on dark). They show the todo sample, never the
  reference video.

The `look` groups:

| Group | Fields | Drives |
| --- | --- | --- |
| `brand` | `font`, `accent`, `ink`, `secondary`, `background {base, fields[5]}`, `sweep[2]`, `dark`, `highlight` | Colours and type family, under demo.json's `brand` |
| `window` | `rect [x, y, w, h]`, `radius`, `shadow` | The window at rest (W1, W3, W5); its aspect sets how crops are fitted |
| `zoom` | `scale`, `dur`, `ease [x1, y1, x2, y2]` | Whole-window zoom (Z2, Z4) |
| `highlight` | `stroke`, `radius`, `pad [x, y]`, `delay`, `fill_alpha`, `halo_alpha` | Highlight boxes (H1 to H5) |
| `pill` | `center_y`, `height`, `radius`, `font_size`, `kinds` | Callout pills (C1, C2, C5); a callout kind not in `kinds` is a plan warning |
| `title` | `font`, `size`, `weight`, `tracking`, `reveal` (`word-blur`, `fade`, `none`), `accent_word` | Title cards (T2, T9, T10); section and end titles scale with `size` |
| `transitions` | `window_in` (seconds of the rise, 0 = in place), `cut` (`inside-window`, `fade`, `cut`) | W6; `cut` other than `inside-window` is recorded and warned about, not drawn yet |
| `end` | `kind` (`sweep-logo`, `card`, `none`), `seconds` | The ending: sweep and logo outro, a plain end card, or nothing required |
| `pacing` | `shot_max`, `zoom_every` | Plan warnings (P2) and a warning for runs that go too long without a zoom |
| `audio` | `lufs`, `true_peak`, `music_gap_db`, `outro_silence` | narrate.py's mix targets and check-cut.py's A2, A3, A6, X3 |

`check-cut.py` reads the look the cut was built with (it is written into `plan.json`), so a copied
look is checked against its own numbers, not the house ones.

## Built-in templates

| id | Look |
| --- | --- |
| `house` | The default: 1560x800 window with 22 px corners on a soft drifting pastel background, 1.15x whole-window zooms over 1.1 s (ease-in-out sine), product-coloured highlight boxes, white pills under the window, Inter titles that blur in word by word, a brand sweep and logo outro, -14 LUFS |

## Where templates live

Searched in this order; the first folder with the id wins:

1. Workspace templates, `<demos root>/_templates/<id>/`: next to the demo being built, then
   `$DEMO_ROOT/_templates`, then `./demos/_templates` (in a clone of the plugin, `<repo>/demos/_templates`).
2. Built-ins, `<plugin>/look-templates/<id>/`.

So a workspace template with the same id as a built-in overrides it. A symlinked template folder,
or a symlinked template.json, is refused. `check.py` in a demos folder skips folders starting with
`_`, so `_templates` is never reported as a demo.

```bash
python3 -I scripts/templates.py list            # id, where, name and description of every template
python3 -I scripts/templates.py show <id>       # its folder and the look merged over the house look
python3 -I scripts/templates.py validate <id>   # schema, README, source.json, six 1280x720 previews
```

## Copying the look of a video

Ask Claude "copy the look of <video>" (skill `demo-template`). It runs three steps, the same way
[the quality bar](quality-bar.md) was made:

1. **Measure.** `scripts/template-from-video.py <video> --out <demos>/_templates --work <scratch>`
   probes the file, finds scene changes, pulls frames into the scratch folder (every 0.5 s for the
   first 20 s, every scene change, and frames either side of each) with 4x4 contact sheets, and
   measures what a machine can: the encode, loudness (EBU R128) and the silent tail, background
   colours at the corners and edges, the most common accent colours, the window's rest rectangle and
   corner radius, the zooms (count, scale, and duration and easing fitted from per-frame window
   width), the window's rise-in time, the pill position, shot lengths and the ending. It writes a
   draft `template.json` (measured values only), `source.json`, a README listing what is left, and
   `measurements.json` in the scratch folder.
2. **Fill by eye.** Claude reads the sheets and frames one by one and fills the rest: the title font
   (by glyph comparison with the bundled Inter and Geist), title size, weight, tracking and reveal,
   pill and highlight styles, text and outro colours, shadow, ending.
3. **Validate.** `scripts/template-validate.py <id> --reference <video> --measurements ... --check`
   renders the todo sample in the template into the scratch folder, pulls six matching moments from
   the reference and from our render, and tiles them side by side (reference left). Claude compares,
   adjusts template.json and runs it again until the pairs match, then saves the previews from that
   render with `--save-previews`.

The reference's frames stay in the scratch folder; delete it when done.

## Using a template

Set `"template": "<id>"` in demo.json and build as usual. The build prints
`template: <id> (workspace|built-in, <folder>)`. If the id is not found, the error lists the ids it
did find and the command to list them.

## Sharing a template

A template is a plain folder with no media from the reference. Zip `<demos>/_templates/<id>/` and
send it. The receiver unzips it into their own `<demos>/_templates/`, runs
`python3 -I scripts/templates.py validate <id>`, and sets the id in a demo.json. To ship one with the
plugin, put it in `look-templates/<id>/` with its previews and add a row to the built-in table above.

## Copyright

A template captures **measurements of a style** (sizes, timings, colours, loudness), not content. It
never holds the reference video, its frames, logos, words, voice or music, and its previews show the
todo sample. Even so, only copy looks you are allowed to reference: your own videos, your company's,
or ones whose owner lets you. Do not use a copied look to pass your video off as someone else's.
