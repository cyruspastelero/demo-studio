# Midnight

Built-in look template `midnight`, made by hand for demo-studio (no reference video). Cinematic and dark: a bigger window on a near-black field with one low glow, huge bold titles that fade up, a slow window entrance and a plain end card instead of the sweep.

- Window: 1560x800 at (180, 90), 16 px corners, a deep shadow with a hairline edge so it lifts off the dark
- Zooms: to 1.15x over 1.6 s with a long, soft ease
- Titles: Geist Bold 176 px, -7 tracking, fade up; light ink on near-black
- Background: near-black #07090D with faint navy and plum glows
- Entrance: the window rises in over 1.2 s; ending: a plain 6 s end card, no sweep or logo outro
- Audio: as the house look (-14 LUFS, music 13 dB under the voice)

`brand.accent` is left out: a demo sets its product colour in demo.json.

Use it: `"template": "midnight"` in demo.json.

Previews (`preview/01..06.png`): the todo sample in this look, rendered with
`scripts/template-validate.py midnight --save-previews`.
