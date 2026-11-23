# Daylight

Motion template `daylight`: a clean, bright look for launch films of everyday productivity tools.
Set by eye from the feel of a bright 2024 productivity-suite launch film (style only: no footage, words,
marks, colours or music were taken). The values are not measured like `airy`'s; tune them in
`style.json`.

- Stage: white, with a soft glow of the brand accent in the middle (`radialCentre`, 5% tint)
- Type: Figtree (bundled, SIL OFL), regular weight, slightly tight tracking; accent words in plain
  brand colour, no gradient
- Reveal: headlines type out at 55 ms per character with a tall caret, like someone typing a prompt
- Panels: white, a thin line border and a soft shadow, 3.5% corners, a gentle 14 degree tilt
- Transitions: scale-down with blur and some morphs; use the `shapeSweep` scene (brand-colour circle
  and pills) between sections instead of `sparkle`
- Celebration: confetti in shades of the accent
- Cursor: hand

Use it for: friendly product launches where the story is "type what you want, click, done": isolated
buttons (`buttonPress`), prompt boxes (`promptType`), real UI zooms (`uiFocus`). Zooms need sharp
sources: record close-up takes (see `skills/demo-motion`, Step 3).

Previews (`preview/01..10.jpg`): `examples/motion-gallery/storyboard.json` in this look (kinetic text,
card scatter, done burst, tilted panel, UI focus, phone, feature list, notifications, chart, lock-up).

A full example in this look: `examples/switchyard-launch/` (a real 36 s ad for an open-source macOS
window manager).
