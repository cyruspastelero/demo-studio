# Paper

Built-in look template `paper`, made by hand for demo-studio (no reference video). Editorial and calm: a small square-cornered window with wide paper margins, titles in Instrument Serif that simply appear, the caption above the window like a headline, gentle zooms and a plain end card.

- Frame: a small 1152x591 window at (384, 236) with wide cream margins, square corners, a hairline and a soft warm shadow
- Type: Instrument Serif Regular 140 px titles, -2 tracking, one colour, no animation: they are simply there. Captions stay in Inter
- Captions: above the window (centred at y 150), 56 px tall with 4 px corners
- Motion: zooms to 1.12x over 1.4 s, ease-in-out sine; the window rises in over 0.9 s
- Ending: a plain 6 s end card, no sweep
- Audio: as the house look (-14 LUFS, music 13 dB under the voice)

Instrument Serif ships in `assets/fonts/` (SIL OFL 1.1). A demo that sets its own `brand.font` or
`brand.title_font` file keeps its product font for titles, as with every look.

Use it: `"template": "paper"` in demo.json.

Previews (`preview/01..06.png`): an Arkitekto story page (our own footage) in this look: title,
wide page, the push into the ramp text, caption, end card, last frame.
