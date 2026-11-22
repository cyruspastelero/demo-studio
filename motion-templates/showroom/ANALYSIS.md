# showroom: measured style analysis (an AI product launch ad)

Source: an AI product launch ad, 1920x1080, **25 fps** (not 30), 73.26 s, with music. Style only: no assets, words or marks from it are reused.
Machine-readable numbers: `measurements.json` (same folder). Scripts: `../../analysis/*.mjs`.

## 1. Cuts and shot list

`select='gt(scene,0.25)'` finds 11 cuts: 2.96, 7.32, 11.40, 17.12, 20.40, 31.72, 33.48, 35.32, 53.28, 54.52, 61.20 s.
Frame checks add one missed hard cut (9.24 s, scene 0.07) and the soft transitions below; two detector hits are soft (17.12 morph, 53.28 blur-zoom).

| # | time s | shot before s | type | beat offset ms | what happens |
|---|---|---|---|---|---|
| 1 | 2.96 | 2.96 | hard cut | +135 | title card to footage |
| 2 | 4.00 | 1.04 | morph | +34 | full-frame footage scales down into a rounded UI card |
| 3 | 7.32 | 3.32 | hard cut | -68 | card shrinks a little, cut to a chat UI |
| 4 | 9.24 | 1.92 | hard cut | +141 | cut to logo blob |
| 5 | 11.40 | 2.16 | hard cut | +19 | cut to cloud background, logo blurred |
| 6 | 13.60 | 2.20 | blur dissolve | -62 | logo blurs out, words blur in |
| 7 | 17.12 | 3.52 | morph | +36 | page becomes a monitor screen as the camera pulls back |
| 8 | 20.40 | 3.28 | blur-zoom | -106 | push into the screen, cut to dark blue |
| 9 | 26.60 | 6.20 | glow burst | -180 | prompt dissolves into cyan/violet light with horizontal streaks, white-out, dashboard emerges (~2.2 s long) |
| 10 | 31.72 | 5.12 | hard cut | -193 | device on plinth |
| 11 | 33.48 | 1.76 | hard cut | -144 | phone on a branch |
| 12 | 35.32 | 1.84 | hard cut | -15 | wider monitor on plinth |
| 13 | 36.80 | 1.48 | morph | -246 | scene scales down into a rounded rect, then a pill with gradient rings |
| 14 | 37.72 | 0.92 | scale-down exit | +104 | pill shrinks away, letters drop in |
| 15 | 40.56 | 2.84 | morph | +92 | text line becomes a line of code |
| 16 | 43.60 | 3.04 | morph | +280 | code highlights become colour bars, then a glass card |
| 17 | 44.80 | 1.20 | morph | -231 | glass card resolves into a dashboard over hills |
| 18 | 51.72 | 6.92 | blur-zoom | -155 | camera flies through a spiral of cards |
| 19 | 53.28 | 1.56 | blur-zoom | +265 | text recedes into a glass card, light to dark |
| 20 | 54.52 | 1.24 | hard cut | -207 | close-up of a page |
| 21 | 61.20 | 6.68 | hard cut | +200 | tablet on plinth |
| 22 | 65.52 | 4.32 | blur dissolve | -43 | scene to dark, button blurs in |
| 23 | 67.60 | 2.08 | morph | -244 | button shrinks into a blooming 3D flower |
| 24 | 69.40 | 1.80 | morph | -155 | flower collapses into the logo mark |
| end | 73.26 | 3.86 | | | logo hold |

**Shot stats (25 shots):** median **2.20 s**, min 0.92 s, max 6.92 s, mean 2.93 s (3.9 beats at 105.2 BPM).

**Transition mix (24):** hard cut 9, morph 8, blur-zoom 3, blur dissolve 2, glow burst 1, scale-down exit 1. Light/dark changes happen through cuts (2.96, 20.40, 31.72, 54.52, 61.20) and the 53.28 blur-zoom.

Not counted as cuts: wordmark build (10.6 s), the glass prompt flipping in (21.2 s), camera pull-back on the prompt (24.7 s), page edits (55.8-60 s), caption build beside the tablet (62.9 s).

## 2. Colour

**Light studio**: #f3f3f3 from top to 70% of height, then a floor gradient 80% #ececec, 90% #e8e7ea, 100% **#e3e3e5**; corners tl/tr #f3f3f3, bl/br #e4e4e6.
**Dark product stage**: navy-black, corners #010d38 / #010103 / #030b2b / #020c30, top #000516, electric-blue light #0b3578, #0d4698, #1659c7, #1331d9, violet #9a61e0.
**End card**: flat #080e18 (alt #060c1a). **Cloud backdrop**: #7888b2-#bbc3d3, dominant #8896b7.
**Glow burst**: centre #cbb6ff -> #d4d2ff, colours #a897fd, #b59afe, #5697d9, #56b9e9, #68c7f7, #184797, corners #000031.

| role | hex |
|---|---|
| text on light | **#030303** |
| text on dark | **#fafdff** |
| accent italic serif on light (left to right) | **#151656 -> #171b76 -> #353be8 -> #3549f6** (single-colour read #3846f7) |
| accent italic serif on dark (left to right) | #b6b9f6 -> #8788f8 -> #555cf8 -> #3848f8 |
| glass panel fill / rim / over | #153065 / #3b5b8b (1-2 px top rim) / #020c30 |
| floor glow under glass | #1750ba |

## 3. Type

- Family feel: neo-grotesk sans plus a **high-contrast italic serif for one accent word per line**.
- Sans lines: cap/ascender **6.8-8.5% of frame** (x-height 5.5-6.2%); lines carrying the serif italic read 9.3-10.3% because of its tall ascenders (x-height stays 5.6-6.2%).
- Weight: stem / cap **0.09-0.123 (median 0.10)**: **Regular (400)**; serif accent regular italic.
- Letter spacing normal (gap / cap median 0.086); word gap 0.41 x cap.
- Reveal: **typewriter**: accent glyphs land at 52.30, 52.54, 52.66, 52.78 s, about **120 ms per glyph** (3 frames at 25 fps); wordmark letters drop in one by one.
- Words on screen: typically 3, max 5. About 0.4 words per beat.
- Alignment: centred; two-line captions left-aligned at ~6% of width when sharing the frame with a device.

## 4. Easing (tracked at 25 fps)

| element | metric | duration | cubic-bezier | rms | note |
|---|---|---|---|---|---|
| screen-to-device pull-back | width 1620 -> 943 px | **840 ms** | **(0.1, 0.33, 0, 0.76)** | 0.012 | then a slow tail, -5 %/s |
| dashboard scale-down to a card | height 1011 -> 309 px | **440 ms** | **(0.92, 0.58, 0.08, 0.71)** | 0.006 | sharp middle, hard ease-in-out |
| pill scale-down exit | width 641 -> 355 px | **440 ms** | **(0.05, 0.34, 0.65, 0.19)** | 0.017 | rings and pill shrink together |
| typewriter | glyph steps | 120 ms per glyph | step | | |

Holds: logo scale drifts **-3.3 %/s**; the monitor reveal keeps easing back at about -5 %/s after its main move.

## 5. Panels and devices

- Perspective feel: product photography; real devices on dark plinths at gentle three-quarter angles; floating glass UI is shown frontal once settled.
- Monitor (18.0 s): **rotateX 12.1, rotateY -13.2 deg at p 2000** (rms 3.2 px); p 2667: 13.3 / -15.8 (rms 1.5); left side and top recede.
- Tablet screen (62.0 s): rotateX 36.7, rotateY -21.4, rotateZ 12.8 deg at p 2000 (rms 8.3 px; leaning back on its stand).
- Glass prompt box (25.0 s): frontal (0 deg) after flipping in; radius about **40 px on 990 px (4% of width)**; 1-2 px light top rim #3b5b8b; translucent fill #153065.
- Shadow: on dark, a blue light pool (#1750ba) under floating glass instead of a drop shadow; devices sit on near-black plinths (#050505-#080808).

## 6. Music

**105.2 BPM** (ACF winner 105.5, comb 105.2; 12 s windows read 105.5 in 9 of 11), beat phase 0.544 s, first downbeat 2.255 s.
Alternates: 157.8 (3/2) and 78.9; fast 0.10 s / 0.20 s onset intervals come from typing and tick sounds on top of the beat.

Cut offsets (ms): +135, +34, -68, +141, +19, -62, +36, -106, -180, -193, -144, -15, -246, +104, +92, +280, -231, -155, +265, -207, +200, -43, -244, -155.
**Median |offset| 142.5 ms**, against 143 ms for random placement; hard cuts alone 141 ms. 29% within 86 ms of a beat.
Reading: cuts are **not beat-locked**; they follow the narrative at ~4-beat shot lengths (median 2.2 s).

## 7. What to reproduce (style JSON inputs)

1. **Two stages**: light studio #f3f3f3 with a floor gradient to #e3e3e5 in the bottom 30%; dark stage navy-black #000516/#010d38 with electric-blue back and floor light (#1659c7, #1331d9) and a touch of violet #9a61e0. End card #080e18.
2. **Text roles**: #030303 on light, #fafdff on dark; one accent word per line in italic serif with a left-to-right gradient #151656 -> #3549f6 (on dark #b6b9f6 -> #3848f8).
3. **Type size**: sans cap height 7.5% of frame height (6.8-8.5), Regular (400), centred; serif italic accent at the same x-height (5.6-6.2%).
4. **Reveal**: typewriter at ~120 ms per glyph (3 frames at 25 fps), no blur; logo letters drop in one by one.
5. **Device entry**: screen-to-device pull-back, 840 ms, cubic-bezier(0.1, 0.33, 0, 0.76), then keep drifting back at -5 %/s.
6. **Exit**: scale-down 440 ms; dashboards cubic-bezier(0.92, 0.58, 0.08, 0.71), pills cubic-bezier(0.05, 0.34, 0.65, 0.19).
7. **Devices**: monitors and tablets on dark plinths; tilt rotateX 12, rotateY -13 deg at p 2000 for hero monitors, up to rotateX 37 / rotateY -21 for a tablet on a stand.
8. **Glass UI**: radius 4% of width, fill #153065 over #020c30, 1-2 px top rim #3b5b8b, blue light pool #1750ba below.
9. **Transition mix** (of 24): hard cut 38%, morph 33%, blur-zoom 13%, blur dissolve 8%, glow burst 4% (one ~2.2 s cyan/violet light burst), scale-down exit 4%.
10. **Camera drift**: slow push-back on holds, -3.3 %/s; reveals have long tails.
11. **Beat use**: 105 BPM bed; ~4-beat shots (median 2.2 s), transitions not snapped to beats (median offset 142 ms = random).
12. **Footage moments**: real photographic plates (forest road, clouds, hills) used as full-frame backgrounds that shrink into UI cards.

## 8. Style JSON trace (styles/showroom/style.json)

Inter's cap height is 0.727 em, so font size (u) = cap height (% of height) / 0.727. The reference runs at
25 fps; frame-based timings are converted to 30 fps.

| style.json field | value | from |
|---|---|---|
| `palette.light.bg` / `bg2`, `background.kind` | #f3f3f3 / #e3e3e5, linear | 1 (light studio with a floor gradient) |
| `palette.dark.bg` / `bg2` / `glow`, `background.darkKind` | #000516 / #010d38 / #1659c7, sky | 1 (navy stage with blue back and floor light) |
| `sceneTones` | panels, devices, prompt, lock-up dark | 1 and 12 (product moments on the dark stage; end card dark) |
| `palette.*.ink` | #030303 / #fafdff | 2 |
| `fonts.accent`, `accentSkew`, `accentWeight` | italic, -11, 300 | 2 (one slanted, lighter accent word per line) |
| `type.hero` | 10.3 | 3 (cap 7.5% / 0.727) |
| `text.reveal`, `charMs`, `caret` | type, 100, true | 4 (3 frames per glyph: 120 ms at 25 fps, 100 ms at 30 fps) |
| `motion.enterMs`, `enterEase` | 840, (0.1, 0.33, 0, 0.76) | 5 |
| `motion.deviceEntry` | pullBack | 5 (screen-to-device pull-back) |
| `motion.exitMs`, `exitEase` | 440, (0.92, 0.58, 0.08, 0.71) | 6 |
| `motion.transition` | cut | 9 (hard cut is the most common, 38%) |
| `motion.drift` | -0.033 | 10 |
| `panel.tilt`, `perspective` | (12.1, -13.2, 0), 2000 | 7 (hero monitor) |
| `panel.radius` | 0.04 | 8 |
| `palette.dark.panel` / `line` | #153065 / #3b5b8b | 8 (glass fill and top rim) |
| `palette.dark.shadowTint` | #1750ba | 8 (blue light pool below glass) |
| `deviceTone` | dark | 7 (devices on dark plinths) |

Not reproduced: the italic **serif** accent (no open-licence serif ships with the engine; a slanted,
lighter sans stands in), the gradient inside the accent word, photographic plates (forest, clouds,
hills: not allowed, the engine shows only real product UI), the glow-burst transition, and morphs.
