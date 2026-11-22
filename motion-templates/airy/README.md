# Airy

Motion template `airy`: the default look for launch ads made with `motion/render-motion.mjs`.
Measured from a light SaaS launch ad ([ANALYSIS.md](ANALYSIS.md); section 8 traces every value in
`style.json`).

- Stage: near-white, mixed 3% toward the brand accent, no gradient, no vignette
- Type: Inter Regular (or your brand font), hero cap height 7.5% of the frame, one accent word per
  line filled with a gradient of the brand colour
- Reveal: each word blur-zooms in from 2x over 433 ms, a new word every 300 ms; the line stays
  centred as it grows
- Exit: scale down to 0.48x with blur over 333 ms; holds pull back slowly (-1.9% per second)
- Panels: 4.5% corners, a 3 px accent border, an accent-coloured glow below, tilted about 26 degrees
- Celebration: check circle that pops, with confetti in shades of the accent
- Cursor: hand

Use it for: bright, friendly launch ads and feature drops where the product UI is light. It reads well
on phones and next to most brand colours.

Previews (`preview/01..10.jpg`): `examples/motion-gallery/storyboard.json` in this look (kinetic text, card
scatter, done burst, tilted panel, UI focus, phone, feature list, notifications, chart, lock-up).
