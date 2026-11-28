# Midnight ad

Motion template `midnight-ad`: the look of the demo-studio launch ad. It starts from `nocturne` and
takes out everything that reads as colour on the stage, so the product footage and one accent carry
the ad. The values were set by eye, not measured.

- Stage: neutral near-black (`#0a0a0a`) with a soft grey lift from the bottom edge; no accent glow,
  no brand tint, and no flip to a light stage
- Type: DM Sans (`site/fonts/`, SIL OFL), medium weight, slightly tight tracking; one colour for every
  word, no gradient accent words
- Reveal: typewriter at 68 ms per character with a caret
- Exit: zoom through with blur (267 ms); holds pull back slowly (-1.7% per second)
- Panels: light cards on the dark stage with a thin neutral rim and a deep shadow instead of an
  accent bloom, tilted (19, 23, -6 degrees)
- Accent: only on the caret, the send button, the stage tiles, the progress bar and the done ring
- Celebration: a ring with a check
- Cursor: hand

Use it for: developer tools and open-source projects with a dark UI, and any ad where the brand
colour should stay a highlight rather than a wash.

Previews (`preview/01..10.jpg`): frames of the demo-studio launch ad itself
(`examples/launch-ad/storyboard.json`).
