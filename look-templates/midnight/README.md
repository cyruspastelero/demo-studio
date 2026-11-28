# Midnight

Built-in look template `midnight`, made by hand for demo-studio (no reference video). Cinematic and dark: the app nearly fills the frame with a thin graphite margin, slow push-in zooms that end full-bleed, big titles that blur in word by word, a long rise-in and a plain end card.

- Frame: a 1792x919 window at (64, 40), so only a thin graphite margin shows; 10 px corners, a deep shadow and a hairline edge
- Motion: every move takes 2.0 s on a long, soft ease. Zooms go to 1.07x with `zoom.edge: 0`, so a push-in ends with the app filling the frame. The wide-first push into a crop moves at the same pace
- Type: Geist SemiBold 184 px titles, -7 tracking, words blur in; light ink on graphite
- Captions: a 56 px pill low in the margin under the window (centred at y 1012)
- Entrance and ending: the window rises in over 1.2 s; a plain 5 s end card, no sweep or logo outro
- Audio: as the house look (-14 LUFS, music 13 dB under the voice)

`brand.accent` is left out: a demo sets its product colour in demo.json, and the one ember glow takes it.

Use it: `"template": "midnight"` in demo.json.

Previews (`preview/01..06.png`): the demo-studio editor (our own footage) in this look: title, wide
page, the slow push into the pill settings, pill, end card, last frame.
