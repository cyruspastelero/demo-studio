# Midnight

Built-in look template `midnight`, made by hand for demo-studio (no reference video). A dark look for dark apps: the window floats on a deep blue-grey field with slow indigo and teal glows, Geist titles that fade in, light text, a cool indigo-to-teal sweep and a near-black outro.

- Window: 1560x800 at (180, 100), 18 px corners, a deep shadow that reads on a dark field
- Zoom: whole window to 1.15x over 1.0 s, ease-in-out sine
- Titles: Geist SemiBold 124 px, -3 tracking, fade in, light ink #EEF1F6 on the dark field
- Background: base #0F1420 with five slow indigo, plum and teal glows
- Pills and highlight boxes: as the house look (white pills read on dark)
- Ending: 7.5 s end card, indigo-to-teal sweep, logo on #07090E
- Audio: as the house look (-14 LUFS, music 13 dB under the voice)

`brand.accent` is left out: a demo sets its product colour in demo.json.

Use it: `"template": "midnight"` in demo.json.

Previews (`preview/01..06.png`): the todo sample in this look, rendered with
`scripts/template-validate.py midnight --save-previews`.
