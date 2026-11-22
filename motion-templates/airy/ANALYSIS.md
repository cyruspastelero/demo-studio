# airy: measured style analysis (a light SaaS launch ad)

Source: a light SaaS launch ad, 1920x1080, 30 fps, 33.09 s, with music. Style only: no assets, words or marks from it are reused.
Machine-readable numbers: `measurements.json` (same folder). Scripts: `../../analysis/*.mjs`.

## 1. Cuts and shot list

`ffmpeg select='gt(scene,0.25)',showinfo` finds **no cuts at all** (max scene score 0.07). The film is one continuous
camera with soft transitions, so every transition below was found from the per-frame track (frame diff, edge energy, scene score;
`cuts.mjs` + `events.mjs`), snapped to the frame of peak change (`refine.mjs`) and confirmed on the 10 fps frames.

| # | time s | shot before s | type | beat offset ms | what happens |
|---|---|---|---|---|---|
| 1 | 1.10 | 1.10 | blur-zoom | -144 | line scales down to ~0.48 with blur (ease-in), next word enters at ~2.0x scale, blurred, settles |
| 2 | 2.20 | 1.10 | blur-zoom | -58 | same, word to word |
| 3 | 4.53 | 2.33 | morph | +247 | icon travels to centre and drops into a panel |
| 4 | 5.77 | 1.23 | scale-down+blur exit | -41 | panel stack shrinks and blurs out, words blur in |
| 5 | 9.80 | 4.03 | whip/motion-blur | -64 | camera swings off a ring of phones, a blue swoosh leads |
| 6 | 10.60 | 0.80 | morph | +229 | swoosh flattens into a progress bar |
| 7 | 12.90 | 2.30 | morph | -6 | bar collapses to a dot that pops into a check circle (confetti) |
| 8 | 14.50 | 1.60 | morph | +72 | circle becomes a white squircle, then the first card of a row |
| 9 | 15.77 | 1.27 | morph | -182 | card row match-cuts into a panel grid |
| 10 | 16.93 | 1.17 | blur-zoom | -30 | push-in on the tilted panel |
| 11 | 18.30 | 1.37 | whip/motion-blur | -184 | one card spins (motion blur) into a scatter of cards |
| 12 | 20.10 | 1.80 | whip/motion-blur | +95 | scatter flies out, list panel swings in |
| 13 | 22.20 | 2.10 | whip/motion-blur | +167 | list panel pans out with blur, single row card in |
| 14 | 24.00 | 1.80 | morph | -62 | dark button becomes the gradient button |
| 15 | 24.63 | 0.63 | sparkle/shape wipe | +64 | light rectangle wipe, big 4-point sparkle shrinks and flies |
| 16 | 26.10 | 1.47 | sparkle/shape wipe | +10 | sparkle trail draws a swoosh, the line writes in behind it |
| 17 | 28.53 | 2.43 | scale-down+blur exit | -92 | line shrinks and fades, logo mark pops, wordmark slides out |
| end | 33.09 | 4.56 | | | logo hold |

**Shot stats (18 shots):** median **1.53 s**, min 0.63 s, max 4.56 s, mean 1.84 s. Median shot = 3.0 beats at 118.3 BPM.

**Transition mix (17):** morph 6, whip/motion-blur 4, blur-zoom 3, scale-down+blur exit 2, sparkle/shape wipe 2, hard cut 0, light/dark flip 0.

Not counted as cuts (same shot): second word of a pair hard-popping in (0.30 s), phones swinging in around the text (6.4 s),
the row card sliding left to reveal its button (22.9 s), the sparkle flight (25.8 s).

## 2. Colour (21x21 median patches on full-res frames)

| role | hex | evidence |
|---|---|---|
| background | **#f8f7fe** flat | all 4 corners, centre and every 10% down the centre and left edge at 2.8 s, 27 s, 30 s are identical; no gradient, no vignette |
| text primary | **#08070b** | word core at 0.8 s; a mid-fade sample reads #2f2c48 |
| accent (gradient inside a word, left to right) | **#186afb -> #66b9fb** | 6.1 s ink clusters #186afb/#2778fa at the left, #59acfa/#66b9fb at the right |
| accent alt, cyan | #16a7f4 | closing line, 27 s |
| accent alt, deep | #0642be -> #0c58f2 | two-word line over cards, 19.5 s |
| accent light (first word) | #4b98f5 -> #69b7f8 | 0.8 s |
| logo blue | #0154fd | 30 s |
| panel fill | #ffffff | row card, cards |
| card border | ~3 px, #3a7bf0 at top fading to #8ecbf9 at the bottom | 15.3 s crop |
| gradient button | #5ab0fe median fill, inner ring #bfe4ff | 24.3 s |
| shadow / glow tint | #cdebff peak (about rgba(0,185,255,0.20) over the bg) | 22.5 s profile |
| progress bar | #5d6cf6 -> #86b8fb -> #78c7fc | 12 s |
| confetti | #017afd, #013cb4, #79ccfc, #fca3fe | 14 s |

## 3. Type

Measured with `type.mjs` (adaptive half-contrast ink mask, row profile, horizontal stem runs).

- Family feel: neo-grotesk sans (Inter-like), one family, no serif.
- Headline line: cap/ascender **7.1-8.2% of frame height** (77-89 px), x-height 5.3-6.0%, ink line incl. descenders 7.2-10.4%.
  Single hero word: 10.8% cap. Closing line: 6.3% cap.
- Weight: stem / cap **0.098-0.118 (median 0.112)**. Regular cuts sit near 0.12 and Bold near 0.19 on this measure: **Regular (400)**.
- Letter spacing: letter gap / cap 0.07-0.16 (median ~0.10): normal, not tight.
- Word spacing: while a line builds the gap is **0.57-0.62 x cap** (about 1.6x a normal space); settled lines 0.36-0.37 x cap.
- Words on screen: typically 2, max 4. About **0.85 words per beat** in the kinetic opening (17 words in 9.8 s = 20 beats).
- Stagger: the second word of a pair pops in **300 ms** after the first, fully opaque on its first frame (no fade). Pairs measured 300-450 ms apart.
- Alignment: **centred** (line centre x = 947-968 px). While words are appended the line slides left at 95-380 px/s.

## 4. Easing (tracked at 30 fps, normalised 0..1, grid-searched cubic-bezier)

| element | metric | duration | cubic-bezier | rms | note |
|---|---|---|---|---|---|
| word blur-zoom entry | width 2.0x -> 1.0x | **433 ms** | **(0.21, 0.29, 0, 0.8)** | 0.005 | first frame already 2x, heavy ease-out |
| same word, blur clearing | edge energy 7.6 -> 23.2 | 367 ms | (0.17, -0.1, 0.07, 0.66) | 0.011 | sharpness proxy |
| line exit | width 1.0 -> 0.48, blur + fade | **333 ms** | **(0.37, 0.15, 0.85, 0.23)** | 0.005 | ease-in, then cut |
| check circle pop-in | height 206 -> 391 px | **300 ms** | **(0, 0.54, 0.96, 1.12)** | 0.020 | fast start, small settle |
| bar collapses to a dot | width 497 -> 198 px | 200 ms | (0.67, 0.19, 0.23, 0.8) | 0.005 | ease-in-out morph |

Holds keep moving: logo scale drifts **-1.9 %/s**; a hero word keeps shrinking fast right after landing (about -34 %/s for 0.3 s).

## 5. Panels

- Perspective feel: low camera, panels lie back like a tabletop, far edge goes soft (depth of field).
- Panel stack (5.3 s): symmetric trapezoid, pure rotateX. Side edges meet **3428 px** above frame centre
  (= p / tan(rotateX)). rotateX = **30.2 deg at perspective 2000 px** (19.3 deg at 1200, 37.8 deg at 2667). Fit rms 0.3 px.
- Library panel (20.8 s): top edge rises 6.6 deg to the right, right edge leans 3.7 deg; horizon vanishing distance 3297 px,
  so rotateY = **-31 deg at p 2000** (left side recedes; -20 deg at 1200, -39 deg at 2667) plus a small rotateX.
- Corner radius: card **30 px on 581 px (5.2% of width)**, visual read 22-25 px (4%); button 45.5 px on 941x237 (4.8% of width, 19% of height).
- Shadow: a coloured glow under the element only. Row card: peak #cdebff 16 px below the edge, visible **208 px below**,
  0 px above, about 12 px at the sides. CSS approximation `0 72px 136px -40px rgba(0,185,255,0.30)`.
  Small card: reach 44 px below / 31 px above (y-offset ~6 px, blur ~38 px, tint #e4ebff). Button: ~12 px, faint.
- Drift: logo -1.9 %/s scale; text lines pan 95-380 px/s while building.

## 6. Music

`tempo.mjs` (mono 22050 Hz, log spectral flux, ACF + comb refinement): **118.3 BPM**, beat phase 0.230 s, first downbeat 0.737 s
(strongest low-band onsets). Check: strong-onset intervals cluster at 0.24-0.26 s and 0.52 s (eighths and quarters of 0.507 s).
Candidates: 118.3 (ACF winner), 78.9 (2/3 relation), 157.7. The first 12 s read 78.3 in a local window (sparser intro); later windows 117.5-120.2.

Cut offsets to nearest beat (ms): -144, -58, +247, -41, -64, +229, -6, +72, -182, -30, -184, +95, +167, -62, +64, +10, -92.
**Median |offset| 72 ms**, against 127 ms expected for random placement. 53% of transitions are within 76 ms (15% of a beat) of a beat.
Of those, 33% are on even beats and 22% on bar lines; gaps between them are 1-14 beats (mostly 3-8).
Reading: transitions are placed **on beats, not on bars**, roughly every 3 beats (= the 1.53 s median shot).

## 7. What to reproduce (style JSON inputs)

1. **Background**: flat #f8f7fe, no gradient, no vignette.
2. **Text roles**: primary #08070b; accent word filled with a left-to-right gradient #186afb -> #66b9fb; alt accents #16a7f4 (cyan), #0642be -> #0c58f2 (deep).
3. **Type size**: headline cap height 7.5% of frame height (range 7.1-8.2), hero single word 10.8%, closing line 6.3%. Regular (400) neo-grotesk, normal tracking, centred.
4. **Reveal**: per line blur-zoom in: start scale 2.0 with blur, settle in 433 ms, cubic-bezier(0.21, 0.29, 0, 0.8); blur clears in 367 ms. Next word in the same line hard-pops after 300 ms (range 300-450). Word gap opens to 0.6 x cap while building.
5. **Exit**: scale to 0.48 with blur and fade, 333 ms, cubic-bezier(0.37, 0.15, 0.85, 0.23), then cut.
6. **Element pop**: 300 ms, cubic-bezier(0, 0.54, 0.96, 1.12) (small settle); morphs 200 ms, cubic-bezier(0.67, 0.19, 0.23, 0.8).
7. **Panels**: white #ffffff, radius 4-5% of width (buttons 19% of height), 3 px blue-to-cyan border on cards. Tilt rotateX 30 deg or rotateY -31 deg at perspective 2000 px, far edge blurred.
8. **Shadow**: coloured downward glow only, `0 72px 136px -40px rgba(0,185,255,0.30)`; small cards about `0 6px 38px` tint #e4ebff.
9. **Transition mix** (of 17): morph 35%, whip/motion-blur 24%, blur-zoom 18%, scale-down+blur exit 12%, sparkle wipe 12%, hard cut 0%.
10. **Camera drift**: constant slow scale-down on holds, -1.9 %/s; lines pan left 95-380 px/s while words append.
11. **Beat use**: 118 BPM; transitions on beats (median offset 72 ms), every ~3 beats (median shot 1.53 s); bar lines not required.
12. **Celebration beat**: progress bar morphs to a check circle with confetti in #017afd, #013cb4, #79ccfc, #fca3fe.

## 8. Style JSON trace (styles/airy/style.json)

`u` is 1% of the frame's shorter side, so at 16:9 it is 1% of frame height. Inter's cap height is
0.727 em, so font size (u) = cap height (% of height) / 0.727.

| style.json field | value | from |
|---|---|---|
| `palette.light.bg` / `bg2` + `background.tint` | #fdfdfc / #fbfbfa + 0.03 | 3 (flat #f8f7fe = white moved about 3% toward the accent; we tint toward the brand accent instead) |
| `background.kind` | flat | 1 (no gradient, no vignette) |
| `palette.light.ink` | #0b0a0d | 2 (#08070b) |
| `fonts.accent` | gradient | 2 (accent word filled left to right, deep to light) |
| `fonts.display.weight` | 400 | 3 (stem/cap 0.112: Regular) |
| `type.hero` | 10.3 | 3 (cap 7.5% / 0.727) |
| `type.title` | 8.7 | 3 (closing line cap 6.3% / 0.727) |
| `type.tracking` | 0 | 3 (letter gap / cap 0.10: normal) |
| `text.reveal`, `scaleFrom`, `blurPx` | blur, 2.0, 14 | 4 (words blur-zoom in from 2.0x) |
| `text.wordMs`, `text.ease` | 433, (0.21, 0.29, 0, 0.8) | 4 (word blur-zoom entry) |
| `text.staggerMs` | 300 | 3 (second word pops 300 ms after the first) |
| line centring while words append | engine behaviour | 3 (line slides left 95-380 px/s while building) |
| `motion.exitMs`, `exitEase`, `exitScale` | 333, (0.37, 0.15, 0.85, 0.23), 0.48 | 4 (line exit to 0.48x with blur) |
| `motion.popMs`, `popEase` | 300, (0, 0.54, 0.96, 1.12) | 4 (check circle pop) |
| `motion.enterMs`, `enterEase` | 600, (0.21, 0.29, 0, 0.8) | no panel entry was trackable; reuses the word curve, slightly longer for big elements |
| `motion.drift` | -0.019 | 5 (-1.9 %/s scale on holds) |
| `motion.transition` | blurScale | 7 (the measured exit); storyboards can set `exit: whip` or `zoomThrough` per scene and add a `sparkle` scene to approach the measured mix |
| `panel.radius` | 0.045 | 5 (4-5.2% of width) |
| `panel.tilt`, `perspective` | (8, -26, 2), 2000 | 5 (library panel rotateY -31 at p 2000; eased to -26 and a little X so real UI text stays readable) |
| `panel.border` | 3px accent at 55% | 5/7 (3 px blue-to-cyan border on cards) |
| `panel.shadow` | `0 6.7U 12.6U -3.7U` accent 30% + `0 0.6U 3.5U` accent 10% | 5 (`0 72px 136px -40px rgba(0,185,255,0.30)` at 1080 px; small cards `0 6px 38px`) |
| `palette.confetti` | accent, darker, lighter, white | 12 (confetti in shades of the accent plus one light colour) |
| `doneVariant` | confetti | 12 |
| `cursor` | hand | hand cursor in every click shot |

Not reproduced: morphs between unrelated elements (35% of transitions: a swoosh flattening into a
progress bar, a bar collapsing into the check circle). The engine has no cross-scene shape morph; the
storyboard uses blur and sparkle transitions there instead.
