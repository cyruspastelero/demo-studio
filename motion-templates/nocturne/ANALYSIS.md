# nocturne: measured style analysis (a dark fintech product video)

Source: a dark fintech product video, 1920x1080, 30 fps, 48.02 s, with music. Style only: no assets, words or marks from it are reused.
Machine-readable numbers: `measurements.json` (same folder). Scripts: `../../analysis/*.mjs`.

## 1. Cuts and shot list

`select='gt(scene,0.25)'` finds only 3 cuts (21.00, 30.00, 47.10 s). The rest are soft, so transitions come from the per-frame track
(diff, edge energy, scene score, luma jumps), snapped to the peak-change frame and checked on 10 fps frames.

| # | time s | shot before s | type | beat offset ms | what happens |
|---|---|---|---|---|---|
| 1 | 4.50 | 4.50 | blur-zoom | +270 | line pushes through the camera (scale up), next word blurred |
| 2 | 5.57 | 1.07 | whip/motion-blur | +137 | horizontal whip: word slides right, logo enters motion-blurred from the left |
| 3 | 7.87 | 2.30 | blur dissolve | +37 | logo blurs out, text blurs in |
| 4 | 10.90 | 3.03 | blur dissolve | +70 | text fades, glowing pill blurs in |
| 5 | 12.77 | 1.87 | morph | +137 | the pill is a toolbar button; camera pulls back to a tilted browser |
| 6 | 14.23 | 1.47 | blur-zoom | -197 | headline scales up past camera, panel drops |
| 7 | 16.67 | 2.43 | morph | -163 | document carries over, words clear, document scales to centre |
| 8 | 19.73 | 3.07 | scale-down+blur exit | -97 | document shrinks, blurs and fades |
| 9 | 21.00 | 1.27 | slide/push | -30 | browser rises from below, text drifts up (scene 0.67) |
| 10 | 22.07 | 1.07 | blur-zoom | -163 | push into the cream card; this is the dark-to-light flip |
| 11 | 23.43 | 1.37 | sparkle/shape wipe | +3 | card warps with violet/mint edge glow into a 4-point sparkle |
| 12 | 24.77 | 1.33 | sparkle/shape wipe | +137 | sparkle trail writes the next line |
| 13 | 27.00 | 2.23 | slide/push | -30 | text pushed left, dashboard rises from below |
| 14 | 28.63 | 1.63 | blur-zoom | -197 | push-in to a single row |
| 15 | 30.00 | 1.37 | light/dark flip | -30 | light to dark radial glow, panel rises (scene 0.36) |
| 16 | 33.50 | 3.50 | whip/motion-blur | -130 | 3D swing to the button area |
| 17 | 35.17 | 1.67 | slide/push | -263 | panel slides up out, table fades in |
| 18 | 37.07 | 1.90 | morph | -163 | table collapses into a glowing pill |
| 19 | 38.07 | 1.00 | morph | +237 | pill shrinks into a ring loader, ring draws a check |
| 20 | 40.10 | 2.03 | light/dark flip | -130 | dark card scales down and falls away, light background revealed |
| 21 | 42.13 | 2.03 | blur-zoom | +103 | line shrinks and blurs out, next word blur-zooms in |
| 22 | 43.75 | 1.62 | morph | -80 | line-art strokes converge into the logo mark |
| 23 | 47.10 | 3.35 | hard cut | +270 | cut to black |
| end | 48.02 | 0.92 | | | black |

**Shot stats (24 shots):** median **1.77 s**, min 0.92 s, max 4.50 s, mean 2.00 s (2.9 beats at 100 BPM).

**Transition mix (23):** blur-zoom 5, morph 5, slide/push 3, whip/motion-blur 2, blur dissolve 2, sparkle/shape wipe 2, light/dark flip 2 (plus #10 flips by zooming into a light card), scale-down+blur exit 1, hard cut 1.

Not counted as cuts: panels flying in behind the opening line (1.03 s), line deleted and retyped (2.2 s), the long line scrolling sideways (8.8-9.6 s).

## 2. Colour

**Dark mode background** (radial glow centred on the bottom edge, about 0.6 frame wide):
vertical stops down the centre 0% #130209, 40% #230926, 50% #2e0f3d, 60% #3d175b, 70% #522382, 80% #6d36aa, 90% #8750cf, 100% **#a069e5**;
corners tl/tr #130209, bl #240b2a, br #311146; left edge stays #130209 to 50% then #240b2c at the bottom. Logo scenes dim the glow (#080103-#0a0005).

**Light mode background**: #fdfdfd top and centre; lavender haze bottom-left (left edge 70% #ebdefc, 80% #e7d5fe, 100% #ece0fc), br #faf6fe; mint haze #d1f0e8 bottom-centre in the outro.

| role | hex |
|---|---|
| text on dark | **#fffcfe** |
| text on light | **#090205** |
| typing tail on dark (newest letters fade in) | #5a3c74 -> #82669a -> #b69cc9 -> #dac9e7 -> white |
| accent words on light (gradient) | **#451b69 -> #552489 -> #8458b7 -> #b596d6** |
| card fill (table rows) | #fefcf6 (warm white) |
| app cream / shade | #fdfbf8 / #f3efe9, dark sidebar #130209 |
| status pill gradient | #9b55fb -> #a162f9 -> #8d4ff9 -> #8995dc, top highlight #bad6e3 |
| pill glow below | #502f66 |
| success ring | #7bfcb6 (mint) |
| browser rim light | #5c2a95 (violet) -> #38564a (mint) along the top edge |

## 3. Type

- Family feel: geometric grotesk sans, one family; logo wordmark bold.
- Opener: typed huge, **cap 16.5% of frame** (x-height 11.3%).
- Main lines: cap/ascender **9.6-10.9%** (x-height 6.3-8.3%); secondary lines 6.2-7.8%.
- Weight: stem / cap **0.089-0.119 (median 0.104)**: **Regular (400), light-leaning**.
- Letter spacing normal (gap / cap median 0.10); word gap 0.47 x cap.
- **Typewriter**: 50-85 ms per character (12-20 chars/s), white caret at full cap height that stays on; a line is cleared in <= 100 ms and retyped;
  the newest ~3 letters fade in through the violet tail colours above.
- Words on screen: typically 3, max 5. About 0.5 words per beat.
- Alignment: centred; a line longer than the frame scrolls sideways (marquee pan) instead of wrapping.

## 4. Easing

| element | metric | duration | cubic-bezier | rms | note |
|---|---|---|---|---|---|
| document entry | height 84 -> 559 px | **500 ms** | **(0.25, 0.16, 0.06, 0.83)** | 0.007 | scale-up from a small tile |
| document exit | width 872 -> 609 px | **267 ms** | **(0.52, 0.1, 0.83, 0.55)** | 0.005 | ease-in shrink |
| document exit, blur | edge energy 10.0 -> 0.9 | 367 ms | (0.27, 0.01, 0.03, 0.43) | 0.037 | blur and fade run longer than the shrink |
| pill blur-in | edge energy 0.7 -> 7.9 | 433 ms | (0.41, 0.21, 0.01, 0) | 0.019 | sharpness proxy; blur clears late |
| typewriter | glyph steps | 50-85 ms per char | step | | see type |

Holds: logo scale drifts **-1.7 %/s**.

## 5. Panels

- Perspective feel: moderate; browser and document turned toward camera from one side with a small roll.
- Document (16.2 s), full quad fit: **rotateX 18.8, rotateY 23.3, rotateZ -6.1 deg at p 2000** (rms 1.4 px);
  best fit at p 2667: 18.1 / 25.9 / -6.4 deg (rms 0.4 px); at p 1200: 17.0 / 18.8 / -5.3 (rms 5.1).
- Browser (27.6 s): top edge falls 6.0 deg to the right, left edge leans 0.8 deg; horizon vanishing distance 3641 px,
  so rotateY = **28.8 deg at p 2000** (right side recedes; 18.2 at 1200, 36.2 at 2667).
- Corner radius: table row card **33 px on 1024x173 (3.2% of width, 19% of height)**; status pill 86 px on 960x223 (39% of height, near capsule).
- Shadow: no dark drop shadows on dark. Elements glow: pill bloom #502f66 reaching ~100 px below and ~57 px above;
  browser gets a violet-to-mint rim light on its top edge.

## 6. Music

**100.0 BPM** (ACF 99.4, comb-refined 100.0; every 12 s window reads 99.4), beat phase 0.030 s, first downbeat 0.030 s.
Check: strong-onset intervals cluster at 0.30 s (41) and 0.60 s (19): eighths and quarters of 0.600 s.

Cut offsets (ms): +270, +137, +37, +70, +137, -197, -163, -97, -30, -163, +3, +137, -30, -197, -30, -130, -263, -163, +237, -130, +103, -80, +270.
**Median |offset| 137 ms**, against 150 ms for random placement: transitions are **not locked to the beat grid**.
30% fall within 90 ms of a beat, none on bar lines; half-beat median 97 ms (random 75). Shots run about 3 beats (1.77 s) on average.
Reading: pacing follows the typing and UI action, with transitions at musical phrase scale rather than on beats.

## 7. What to reproduce (style JSON inputs)

1. **Background (dark)**: near-black violet #130209 with a bottom-centre radial glow, stops 50% #2e0f3d, 70% #522382, 90% #8750cf, 100% #a069e5; dim the glow for logo beats.
2. **Background (light)** for the flip section and outro: #fdfdfd with lavender haze bottom-left (#e7d5fe) and a mint haze (#d1f0e8).
3. **Text roles**: #fffcfe on dark, #090205 on light; accent gradient on light #451b69 -> #8458b7 -> #b596d6; typing tail #5a3c74 -> #dac9e7.
4. **Type size**: main lines cap 10% of frame height (9.6-10.9), opener 16.5%, secondary 6.2-7.8%. Regular (400) geometric grotesk, centred.
5. **Reveal**: typewriter, 50-85 ms per char, persistent caret, 3-letter violet fade tail; clear a line in <= 100 ms then retype. Single words blur in over ~430 ms.
6. **Panel entry**: scale-up from a small tile, 500 ms, cubic-bezier(0.25, 0.16, 0.06, 0.83); big panels rise from below (slide/push).
7. **Exit**: shrink 267 ms cubic-bezier(0.52, 0.1, 0.83, 0.55) while blur and fade run 367 ms.
8. **Panels**: tilt rotateX 19, rotateY 23-29, rotateZ -6 deg at perspective 2000 px; card radius 3.2% of width (19% of height); warm white #fefcf6 cards.
9. **Glow instead of shadow**: violet pill #9b55fb -> #8d4ff9 with bloom #502f66; violet-to-mint rim light on panel tops; mint success ring #7bfcb6.
10. **Transition mix** (of 23): blur-zoom 22%, morph 22%, slide/push 13%, whip 9%, blur dissolve 9%, sparkle wipe 9%, light/dark flip 9% (one dark-to-light and one light-to-dark trip, around 22-30 s and 40 s), scale-down exit 4%, hard cut 4% (end only).
11. **Camera drift**: slow push-back on holds, -1.7 %/s.
12. **Beat use**: 100 BPM bed; shots ~3 beats (median 1.77 s), but do not snap transitions to beats (measured median offset 137 ms vs 150 random).

## 8. Style JSON trace (styles/nocturne/style.json)

Geist's cap height is about 0.73 em, so font size (u) = cap height (% of height) / 0.73.

| style.json field | value | from |
|---|---|---|
| `tone` | dark | 1 |
| `palette.dark.bg` / `bg2` | #0d0609 / #160a14 | 1 (#130209 near-black; kept neutral so the brand accent supplies the hue) |
| `background.kind`, `glowAccent` | radialBottom, true | 1 (bottom-centre radial glow; its colour becomes the brand accent) |
| `palette.light.*` | #fdfdfd base, #f6f3fa haze | 2 (flip section #fdfdfd with a lavender haze) |
| `sceneTones` | uiFocus, aspectMorph, logoLockup light | 10 (one dark-to-light trip for the in-app section, light outro) |
| `palette.dark.ink` / `palette.light.ink` | #fffcfe / #090205 | 3 |
| `fonts.accent` | gradient | 3 (accent gradient across the word) |
| `fonts.display` | Geist 380 | 4 (Regular geometric grotesk, leaning light) |
| `type.hero` / `title` / `body` | 13.7 / 9.6 / 5.4 | 4 (cap 10% / 0.73; secondary 7% / 0.73) |
| `text.reveal`, `charMs`, `caret` | type, 68, true | 5 (typewriter 50-85 ms per char, persistent caret) |
| `text.wordMs` | 430 | 5 (single words blur in over about 430 ms) |
| `motion.enterMs`, `enterEase` | 500, (0.25, 0.16, 0.06, 0.83) | 6 |
| `motion.exitMs`, `exitEase` | 267, (0.52, 0.1, 0.83, 0.55) | 7 |
| `motion.transition` | zoomThrough | 10 (blur-zoom is the most common, 22%) |
| `motion.drift` | -0.017 | 11 |
| `panel.tilt`, `perspective` | (18.8, 23.3, -6.1), 2000 | 8 |
| `panel.radius` | 0.032 | 8 |
| `palette.dark.panel`, `panelInk` | #fefcf6, #0d0609 | 8 (warm white cards on the dark stage, dark text on them) |
| `panel.glow` | 1px accent rim + 60px accent bloom | 9 (glow instead of shadow) |
| `doneVariant` | ring (with accent glow) | 9 (success ring) |

Not reproduced: the 3-letter fading tail behind the caret (the caret is drawn, the tail is not), the
second (mint) rim colour, and slide/push transitions (13%).
