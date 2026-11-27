# Paper

Built-in look template `paper`, made by hand for demo-studio (no reference video). Editorial and calm: a smaller window with wide margins and square print-like corners, the caption pill above it, thin titles that simply appear and a cream field.

- Window: 1320x700 at (300, 170), smaller with wide cream margins, 4 px corners, a hairline and a soft warm shadow
- Caption pill: above the window (centred at y 96), 60 px tall with 8 px corners
- Titles: Inter Light 112 px, -2 tracking, no animation: they are simply there
- Zooms: only to 1.08x over 1.6 s
- Ending: a plain 7 s end card, no sweep
- Audio: as the house look (-14 LUFS, music 13 dB under the voice)

`brand.accent` is left out: a demo sets its product colour in demo.json.

Use it: `"template": "paper"` in demo.json.

Previews (`preview/01..06.png`): the todo sample in this look, rendered with
`scripts/template-validate.py paper --save-previews`.
