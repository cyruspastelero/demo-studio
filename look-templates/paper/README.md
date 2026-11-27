# Paper

Built-in look template `paper`, made by hand for demo-studio (no reference video). A warm, editorial look: a cream paper field with soft peach and sand tints, rounder corners, gentle 1.1x zooms, Inter titles that blur in word by word, and an amber-to-coral sweep.

- Window: 1560x800 at (180, 100), 28 px corners, a warm brown-tinted shadow
- Zoom: whole window to 1.1x over 1.3 s, ease-in-out sine: calmer than the house look
- Titles: Inter Display Medium 128 px, -3.5 tracking, words blur in one by one
- Background: base #EFE8DC (cream) with peach, sand and linen tints
- Pacing: shots up to 9 s, window rises in over 0.8 s
- Ending: 7.9 s end card, amber-to-coral sweep, logo on #2A221B
- Audio: as the house look (-14 LUFS, music 13 dB under the voice)

`brand.accent` is left out: a demo sets its product colour in demo.json.

Use it: `"template": "paper"` in demo.json.

Previews (`preview/01..06.png`): the todo sample in this look, rendered with
`scripts/template-validate.py paper --save-previews`.
