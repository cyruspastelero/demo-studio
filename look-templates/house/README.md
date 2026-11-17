# House look

Built-in look template `house`: the demo-studio default, the look every demo gets without a
`template`. Its values equal `scripts/keynote/spec.py`, which is measured in
[docs/quality-bar.md](../../docs/quality-bar.md). Naming it in demo.json changes nothing
(`tests/smoke-templates.sh` checks the plan is identical).

- Window: 1560x800 at (180, 100), 22 px corners, soft two-layer shadow, rises in over 0.7 s
- Zoom: whole window to 1.15x over 1.1 s, ease-in-out sine
- Highlight boxes: 3 px stroke, 12 px corners, 15x9 px padding, 7% fill and a 6 px halo at 10%, 0.17 s after a zoom lands
- Pills: 68 px tall, fully round, centred at y 962, 30 px Inter Medium
- Titles: Inter Display Medium 132 px, -4 tracking, words blur in one by one, one accent word
- Background: base #E3E3E4 with five drifting pastel fields
- Ending: 7.9 s end card, brand sweep, logo on #1B1D21
- Audio: -14 LUFS, true peak under -1 dBTP, music 13 dB under the voice, 3 s silent tail

`brand.accent` is left out on purpose: without it, highlight boxes and pills are neutral ink and the
title accent is #D9463B. A demo sets its product colour in demo.json `brand.accent`.

Previews (`preview/01..06.png`): the todo sample in this look (title, window at rest, zoom with a
highlight, pill, end card, outro on dark), rendered with `scripts/template-validate.py house
--save-previews`.
