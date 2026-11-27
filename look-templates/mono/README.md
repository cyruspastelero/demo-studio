# Mono

Built-in look template `mono`, made by hand for demo-studio (no reference video). Full screen and fast: the app nearly fills the frame for detail-heavy products, small quick zooms, bold titles with no animation, greys only, and a short plain end card instead of the sweep.

- Window: 1620x800 at (150, 40), the largest the engine draws, high in the frame, square corners and a 1 px line instead of a shadow
- Zooms: only to 1.06x over 0.7 s
- Caption pill: a slim 52 px bar under the window with 6 px corners; boxes 2 px with 4 px corners
- Titles: Geist SemiBold 140 px, -5 tracking, one colour, no animation
- Ending: a short 4 s plain end card, no sweep or logo outro
- Audio: as the house look (-14 LUFS, music 13 dB under the voice)

`brand.accent` is left out: a demo sets its product colour in demo.json.

Use it: `"template": "mono"` in demo.json.

Previews (`preview/01..06.png`): the todo sample in this look, rendered with
`scripts/template-validate.py mono --save-previews`.
