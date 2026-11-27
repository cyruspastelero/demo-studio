# Mono

Built-in look template `mono`, made by hand for demo-studio (no reference video). A crisp, neutral look: quiet greys with no colour in the background, tight 10 px corners, quicker zooms and hard cuts, Geist titles that fade in, and a black sweep. Lets the product's own colour be the only colour.

- Window: 1560x800 at (180, 100), 10 px corners, a short crisp shadow
- Zoom: whole window to 1.12x over 0.9 s; hard cuts between shots
- Highlight boxes: 2 px stroke, 6 px corners; pills 60 px tall with 12 px corners, 28 px text
- Titles: Geist SemiBold 120 px, -3 tracking, fade in
- Background: greys only (#EDEDED base), so the product colour is the only colour
- Pacing: shots up to 6 s; ending 6.5 s end card, black sweep, logo on #0A0A0A
- Audio: as the house look (-14 LUFS, music 13 dB under the voice)

`brand.accent` is left out: a demo sets its product colour in demo.json.

Use it: `"template": "mono"` in demo.json.

Previews (`preview/01..06.png`): the todo sample in this look, rendered with
`scripts/template-validate.py mono --save-previews`.
