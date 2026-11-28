# Mono

Built-in look template `mono`, made by hand for demo-studio (no reference video). Flat and technical: one even grey with no glow, a square window with a hairline edge, Geist Mono for titles and captions, square tags, crisp half-second zooms, titles that fade in and a short end card.

- Frame: a 1520x780 window at (200, 72), square corners and a 1 px line instead of a shadow, on one flat grey (no glow, even with a product accent)
- Type: Geist Mono Medium 120 px titles, -3 tracking, fading in; captions in Geist Mono too
- Captions: square 52 px tags under the window; highlight boxes 2 px, square, no fill or halo
- Motion: zooms to 1.1x in 0.5 s on a sharp ease-out, and the wide-first push into a crop is just as quick; the window rises in over 0.3 s
- Ending: a short 3 s plain end card, no sweep or logo outro
- Audio: as the house look (-14 LUFS, music 13 dB under the voice)

`brand.accent` is left out: a demo sets its product colour in demo.json; it colours the boxes and
caption text, never the background.

Use it: `"template": "mono"` in demo.json.

Previews (`preview/01..06.png`): the demo-studio render checks (our own footage) in this look:
title, wide page, the push into the checks list with a box, caption, end card, last frame.
