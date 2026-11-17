# Quality bar for finished videos

Every value here was measured from a reference cut (95.9 s, 1920x1080, 30 fps, H.264 + AAC) that the owner set as the **bare minimum** a demo-studio render has to reach. Frames were pulled with ffmpeg and measured pixel by pixel (window edges per frame, colour samples, cap heights, loudness). Where the reference's editable source was available, it was used only to confirm a measured value. Nothing in this document depends on the product shown in the reference.

All sizes are px in a 1920x1080 frame. All times are seconds. "Ease-out cubic" means `cubic-bezier(0.33, 1, 0.68, 1)`. "Ease-in-out cubic" means `cubic-bezier(0.65, 0, 0.35, 1)`. "Ease-in-out sine" means `cubic-bezier(0.37, 0, 0.63, 1)`.

---

## 1. The bar in one paragraph

A finished cut opens directly on a title, with no black frame. It sits on a soft, slowly drifting, multi-colour pastel background. The product appears in one floating rounded window that is cropped tight to the UI that matters, so app text reads at about 20 px cap height. That window rises in from below frame. It stays put while clips cut inside it, and the whole window (not just its contents) eases up to 1.15x to point at something, then eases back. A red outline marks the exact UI element being talked about. Short pill callouts sit centred under the window: a person (avatar + "Name, role") or a statement in the accent colour. All type is one grotesk (Inter) at medium weight with tight tracking, and words blur in one by one. Narration runs under about 60% of the runtime, over a music bed 12 to 14 dB below it. The cut ends on a timed end card, a brand-gradient sweep, and a logo outro on dark.

---

## 2. Spec

### 2.1 Encode

| # | Property | Bar |
|---|---|---|
| E1 | Container / codec | MP4, H.264 High, level 4.0 or 4.1 |
| E2 | Frame | 1920x1080, 30 fps constant |
| E3 | Pixel format / colour | yuv420p, **tagged** BT.709 primaries, transfer and matrix, `color_range=tv` (the reference is tagged; untagged files shift colour in some players) |
| E4 | Video bitrate | ≥ 3.5 Mbps average (reference: 3.67 Mbps). CRF 16 to 18 is fine if the result clears this on UI footage |
| E5 | GOP | Fixed 2.0 s keyframe interval (`-g 60 -keyint_min 60 -sc_threshold 0`). The reference has a keyframe at every 2.000 s |
| E6 | Audio | AAC-LC, 48 kHz, stereo, ≥ 160 kbps (reference: 179 kbps) |
| E7 | Faststart | `moov` before `mdat` (`-movflags +faststart`). The reference does **not** do this; we must beat it |

### 2.2 Background

| # | Property | Bar |
|---|---|---|
| B1 | Base fill | `#E3E3E4` |
| B2 | Colour fields | Five radial blobs (colour at centre, fading to transparent at 68% of radius) over the base: warm white `#FAF9F7` r=1500 at (16%, 20%); cool blue-grey `#BCC6D3` @95% r=1400 at (92%, 8%); dusty pink `#E6C4C2` @95% r=1400 at (95%, 100%); warm grey `#DEDAD9` r=1200 at (5%, 98%); soft centre `#F1EFED` @85% r=1100 at (50%, 50%) |
| B3 | Measured samples (must land within ±4 per channel) | (40,40) `#EFEFEF` · (960,40) `#E4E4E4` · (1880,40) `#C2CAD6` · (40,1040) `#E0DBDA` · (1880,1040) `#E5C9C8` · glow at (320,240) `#FAF7F6` · centre `#EEEBEA` |
| B4 | Motion | Each blob drifts on a sine with amplitude 2 to 4% of frame size and angular frequency 0.03 to 0.08 rad/s. It is near-static: corner samples move ≤ 2 levels over 84 s. It must never visibly pulse. |
| B5 | Grain / vignette | None. A flat 40x40 patch has σ = 0.56 (encode noise only). The darker corners come from the colour fields, not from a vignette. |
| B6 | Constancy | The same background runs under every title, window and end card until the outro sweep. A dark UI section does **not** change it. |

### 2.3 Window (the product frame)

| # | Property | Bar |
|---|---|---|
| W1 | Rest rectangle | x 180 to 1740, y 100 to 900: **1560x800** (1.95:1), centred horizontally. This leaves a 180 px band below it for callouts. |
| W2 | Crop | The window shows a **crop** of the recorded UI, not the whole viewport. At rest, UI content is about 1.15x its recorded CSS size. App body text has a cap height of **≥ 18 px** at rest (reference: 20 px) and about 23 px when zoomed. Empty sidebars and blank margins are cropped away. |
| W3 | Corner radius | 22 px at rest. It scales with the window (about 25 px at 1.15x). |
| W4 | Fill | `#FFFFFF` for light UI, `#1B1D21` for a dark UI section, with the same geometry |
| W5 | Shadow | `0 50px 110px rgba(45,40,60,0.16), 0 14px 34px rgba(45,40,60,0.09)`. Measured against the bare background: −31 levels 6 px below the bottom edge, −13 at 54 px, −5 at 100 px; −18 just right of the side edge, −4 at 60 px. |
| W6 | Entry | The window rises from below frame (top edge at y≈1000) to y=100 over **0.70 s, ease-out cubic**. Measured top edge: 6.000→860, 6.200→377, 6.300→242, 6.400→160, 6.500→118, 6.600→102, 6.667→100. The previous card fades and blurs out over the same span. |
| W7 | Continuity | Inside a sequence, clips **hard-cut inside a stationary window**. The frame never jumps or re-enters. A light-to-dark UI switch is a 3-frame cut with the same geometry. |
| W8 | Exit to a title card | The window fades out in 4 frames (about 0.13 s), then the title's first word starts. There is no dip through an empty background between two window shots. |

### 2.4 Framing changes (zoom)

| # | Property | Bar |
|---|---|---|
| Z1 | What moves | The **whole window** (frame + content + shadow) scales and translates. Content is not zoomed inside a fixed frame. |
| Z2 | Factor | 1.000 → **1.150** (1560x800 → 1794x920). Nothing bigger: the reference never exceeds 1.15x of rest. |
| Z3 | Stays in frame | The zoomed window keeps ≥ 40 px clear on every side. Measured zoom rectangles: x 86 to 1880 / 58 to 1852, y 40 to 960, or y 120 to 1038 when the target sits low. The pan moves the centre ≤ 70 px toward the target. |
| Z4 | Duration / easing | **1.10 s** (33 frames) both in and out, **ease-in-out sine** `cubic-bezier(0.37, 0, 0.63, 1)`. Measured progress at 0.1, 0.2, … 0.9 of the move: .02, .08, .17, .30, .43, .57, .71, .83, .92 |
| Z5 | Hold | 2.4 to 4.3 s at 1.15x before easing back |
| Z6 | Frequency | 7 zoom-ins over 76 s of footage, so about one every 11 s. Zoom only to land a point that narration is making. |
| Z7 | Callout interaction | The zoomed window covers the callout band, so a callout ends before a zoom and does not return until the zoom-out has finished. |

### 2.5 Highlight annotations (red outline on a UI element)

| # | Property | Bar |
|---|---|---|
| H1 | Stroke | 3 px solid `#E2483C` (measured core `#E2483E`/`#E0483B`) |
| H2 | Radius | 12 px |
| H3 | Fill + halo | Fill `rgba(226,72,60,0.07)` (measured `#FDF2F0` over white). Outer halo `0 0 0 6px rgba(226,72,60,0.10)` (measured `#FCECEB` band) |
| H4 | Padding | 15 px horizontal and 9 px vertical around the element's text box, after window scale |
| H5 | Timing | It appears **0.17 s after a zoom lands**, holds through the zoom (measured 13.27 to 16.3+), and stays glued to the UI while the window zooms back out |
| H6 | Animation | In: 0.40 s ease-out cubic, opacity 0→1, scale 1.12→1. Out: 0.30 s linear opacity. |
| H7 | Count | ≤ 2 boxes on screen, and only on the element the narration names |

### 2.6 Callout pills (under the window)

| # | Property | Bar |
|---|---|---|
| C1 | Position | Centred at (960, **962**), in the band between the window bottom (900) and the frame edge |
| C2 | Shape | Height 68 px (measured 928 to 995), radius 999, fill `rgba(255,255,255,0.95)`, shadow `0 14px 40px rgba(60,45,60,0.12), 0 2px 6px rgba(60,45,60,0.06)` |
| C3 | Person variant ("a sales person callout") | 50 px circular avatar, padding `9px 30px 9px 9px`, gap 14. "Name," in ink `#24272B` (measured `#212123`), role in `#7A8089` (measured `#7A7C80`). Measured size 316x67. |
| C4 | Statement variant | No avatar, padding `16px 32px`, all text in accent `#D9463B` (measured `#DB4435`). ≤ 6 words. Measured 453x67 for a 28-character line. |
| C5 | Type | Inter 500, 30 px (measured cap height 22 px), letter-spacing −0.3 px |
| C6 | Entry | 0.45 s ease-out cubic: opacity 0→1, translateY +16→0, scale 0.96→1. Words stagger 0.07 s, each 0.40 s ease-out cubic with blur 8→0 px and translateX +10→0. It starts within 0.1 s of the window landing (measured: window lands 6.667, pill 6.73). |
| C7 | Exit | 0.35 s: opacity→0, blur 0→6 px, translateY +8 |
| C8 | Duration | 3.0 to 5.0 s on screen (measured 4.1, 4.8, 4.2, 5.0, 3.0). One pill at a time. Never for a whole long scene. |

### 2.7 Typography

| # | Role | Font / weight / size / tracking | Measured |
|---|---|---|---|
| T1 | Family | **Inter** everywhere (glyph cap height is exactly 0.727 em at every measured size, which matches Inter and not SF Pro's 0.705) | |
| T2 | Hero / section title | 500, **132 px**, −4 px | "W" cap 96 px |
| T3 | Hero after settle | Same title scaled to 0.52 (≈ 69 px), moved up 70 px | "T" cap 50 px |
| T4 | Card heading | 500, 72 px, −2 px | "M" cap 53 px |
| T5 | End-card title | 500, 104 px, −3 px | "A" cap 76 px |
| T6 | Subtitle / tagline | 400, 42 px (−0.6 px) or 40 px (−0.5 px) | "A" cap 31 px |
| T7 | Person name / role (cast card) | 500 46 px −1 px / 400 30 px | caps 36 / 23 px |
| T8 | Colours | Ink `#24272B` (measured `#202124`), secondary `#5F656D` (measured `#6A6C6D`), tertiary `#6B7178`, accent `#D9463B` (measured `#DC4334`) | |
| T9 | Accent rule | Exactly **one** accent word per title or subtitle: the key noun ("Meet the **team**", "Who is on the **team?**"). Never whole lines, never two colours. | |
| T10 | Word reveal | Per word, 0.50 s ease-out cubic: opacity 0→1, blur 16→0 px, translateX +26→0. Stagger 0.13 s (titles), 0.05 s (subtitles). | |
| T11 | Settle | 0.60 s ease-in-out cubic after the title lands (scale 1→0.52, up 70 px). The subtitle starts 0.20 s after the settle begins. | |
| T12 | Card exit | 0.40 s ease-in-out cubic: opacity→0 and translateY −50 to −70 px, with blur | |

### 2.8 Cursor

| # | Property | Bar |
|---|---|---|
| K1 | Style | A synthetic cursor drawn into the footage: a **24 px disc `#8FAFF5`**, a 2 px white ring and a 1 px `#A9ABAD` hairline, about 30 px overall at rest. It scales with the window. |
| K2 | Never | The OS arrow or hand pointer captured from the screen |
| K3 | Motion | Smooth eased travel between targets with no jitter, and the cursor rests on the element being discussed |
| K4 | Click feedback | Not measurable in the reference render. Recommended: press scale 0.86 for 0.16 s, plus a ring growing to 60 px (2 px `rgba(255,255,255,0.85)`) that fades over 0.50 s |

### 2.9 Opening, cast card, section card

| # | Property | Bar |
|---|---|---|
| O1 | First frame | No black or blank frame. The hero title is already blurring in at frame 0 (fully in by 0.5 s). |
| O2 | Opening card | Hero 132 px holds until about 1.0 s, settles (T11), then subtitle words reveal with one accent word, hold until about 3.3 s, and exit 0.4 s. Card length about 3.4 s. |
| O3 | Cast card (when people appear) | Heading 72 px at top=250 with one accent word. Two 230 px circular avatars at x = 960 ± 280, top 410, shadow `0 30px 70px rgba(45,40,60,0.16), 0 8px 20px rgba(45,40,60,0.08)`. Avatars reveal at +0.4 / +0.6 s (scale 0.88→1, blur 12→0); names (46 px) and roles (30 px) follow 0.2 s later. About 2.6 s, after which the window rises over it (W6). |
| O4 | First UI | ≤ 6.0 s into the cut |
| O5 | Section card | A mid-cut question title ("Who is on the team?" form), 2.2 to 2.6 s, same reveal and exit |

### 2.10 End card and outro

| # | Property | Bar |
|---|---|---|
| X1 | End card | Brand mark about 128 px wide at top=330. Title 104 px with words revealed **about 0.1 s before narration says them**, then a 40 px tagline revealed the same way. About 7.9 s. |
| X2 | Sweep | A brand-gradient band (`linear-gradient(100deg, #EF4849, #F68C41)`; measured `#FE5541` → `#FF8D3C`), skewed −4°, sweeps up over 0.8 s ease-in-out cubic and reveals a dark field `#1B1D21` |
| X3 | Logo outro | The mark animates into a centred lockup (measured 700x100 at centre) and holds ≥ 3 s. Music fades out by the last 3 s, which are silent. |
| X4 | Tail | From the last UI frame to the end ≈ 13 s (reference 82.6 → 95.9) |

### 2.11 Pacing

| # | Property | Bar |
|---|---|---|
| P1 | Overall | Reference: 95.9 s for 7 beats. Opening 0 to 6.0 → UI 6.0 to 28.7 → section card 28.8 to 31.0 → UI 31.0 to 53.3 → dark UI 53.3 to 67.7 → UI 67.7 to 82.6 → end card 82.6 to 90.5 → outro 90.5 to 95.9 |
| P2 | Shot length inside the window | 2 to 6 s between cuts or framing changes. A single uninterrupted window shot never exceeds 8 s. |
| P3 | Text dwell | Callouts 3 to 5 s; titles 2.2 to 3.4 s; end-card title and tagline ≥ 5 s |
| P4 | Holds | ≥ 0.6 s of still UI after each meaningful result (for example a reply landing) before the next action |

### 2.12 Audio

| # | Property | Reference (measured) | Bar |
|---|---|---|---|
| A1 | Narration | Present for 59 of 96 s (momentary > −16 LUFS). Starts at about 3 s. | Narration on every beat except the outro; ≥ 50% of runtime |
| A2 | Integrated loudness | −12.4 LUFS | **−14 LUFS ±1** (−12 is the hot ceiling) |
| A3 | True peak | −0.2 dBTP | **≤ −1.0 dBTP** (beat the reference; −0.2 clips after platform transcode) |
| A4 | Loudness range | 15.1 LU | ≤ 15 LU |
| A5 | Speech level | Speech-section RMS −13 to −16 dBFS; momentary peaks −8 to −10 LUFS | Same, ±2 dB |
| A6 | Music bed | Music-only gaps −26 to −28 LUFS momentary (RMS −27 dBFS), so 12 to 14 dB under speech-section RMS. It drops to −35 dBFS (lows removed) under one key visual moment. Starts at t=0 (−33.5 LUFS momentary). Fades out over the last 4 s. | Bed present from frame 0, 12 to 18 dB under narration, with ≥ 1 deliberate drop on a key moment |

---

## 3. Gap table: current story-mode keynote cut vs the bar

Measured the same way on an earlier sample cut (37.5 s), built by `scripts/build-keynote.py` and `scripts/mk-assets.py`.

| Area | Ours (measured) | Bar | Gap |
|---|---|---|---|
| Audio | **No audio stream at all** | Narration + bed, −14 LUFS, TP ≤ −1 | Missing entirely |
| Font | `system-ui` → SF Pro (not licensed to bundle; Linux renders a fallback). Titles 600, captions 600 | Bundled Inter, 500 titles, 400 subtitles | Wrong family and weight, not portable |
| Callouts | Bare text, SF 600 44 px `#171918`, no pill, avatar or accent. **On screen for the whole scene (8.3 s and 22.6 s).** | 68 px pill at y=962, 30 px Inter 500, 3 to 5 s, person or accent variant | No callout component |
| Highlights | None | 3 px `#E2483C` box, radius 12, halo, eased in after a zoom | Missing |
| Zoom model | Content-only zoompan inside a fixed frame. 1.5x, smoothstep 1.6 s. It crops arbitrarily (logo cut to "rkitekto") and leaves about 30% of the frame as empty grey sidebar (t=33 s). | Whole window 1.15x, 1.1 s ease-in-out sine, window stays in frame | Wrong model; too deep and too slow |
| Window | Fixed 1600x900 at (160,44) showing the full 16:9 viewport at 0.83x. Body text cap ≈ 13 px at rest. | 1560x800 tight crop at 1.15x, body cap ≥ 18 px | UI about 35% too small; no crop |
| Background | Flat `#F2F3F5` at every sample point | Five-field pastel drift (`#C2CAD6` blue, `#E5C9C8` pink, `#FAF7F6` glow) | No colour, no depth |
| Transitions | Every cut dips through an empty background (0.4 s out + 0.4 s in; frame at t=3.0 s is blank) | Window rise 0.7 s ease-out, cuts inside a persistent window, no blank frames | Dead air at every join |
| Title cards | Static PNG, SF 600 112 to 124 px, 3% push-in, no word reveal, no accent word | Inter 500 132 px, per-word blur reveal, settle, one accent word | Static and generic |
| Opening | 3.0 s static card; first UI at 3.0 s after a blank dip | Animated hero + subtitle (+ cast card); first UI ≤ 6 s | No motion and no "who" |
| Outro | Static 3.6 s card with a URL | Timed end card, gradient sweep, logo animation on dark, ≈ 13 s tail | No closing beat |
| Cursor | Captured OS hand pointer at 0.83x | 24 px blue disc + white ring, scales with window | Looks like a raw screen grab |
| Pacing | 2 scenes of 8.3 s and 22.6 s, single shots with scroll | 2 to 6 s shots, ≤ 8 s uninterrupted, zoom about every 11 s | Far too long per shot |
| Encode | 1.79 Mbps; colour **untagged**; irregular GOP (keyframes up to 8.3 s apart); B-frames | ≥ 3.5 Mbps, BT.709 tagged, 2 s GOP | Under spec |
| Faststart | Yes (`moov` at 36) | Yes | Already beats the reference |

---

## 4. Review checklist ("done when")

Run these on any new render. Each line is pass/fail. Frame grabs: `ffmpeg -ss <t> -i cut.mp4 -frames:v 1 f.png`.

**Encode and audio**
- [ ] `ffprobe` shows h264 High, 1920x1080, 30/1, yuv420p, `color_primaries=bt709`, `color_transfer=bt709`, `color_space=bt709`, `color_range=tv`.
- [ ] Video bitrate ≥ 3.5 Mbps. Keyframes every 2.0 s (`ffprobe -show_entries packet=pts_time,flags`).
- [ ] An AAC 48 kHz stereo stream exists, ≥ 160 kbps.
- [ ] `ffmpeg -i cut.mp4 -af ebur128=peak=true -f null -` gives I = −14 ±1 LUFS, true peak ≤ −1.0 dBTP, LRA ≤ 15 LU.
- [ ] Momentary loudness in narration-free gaps is −24 to −32 LUFS (the bed is audible, not silent and not competing).
- [ ] `moov` comes before `mdat`.

**First 10 seconds**
- [ ] Frame 0 is not black or blank; title glyphs are visible by 0.5 s.
- [ ] Title words enter one at a time with blur (check frames at 0.1 s steps).
- [ ] Exactly one word per title is in the accent colour.
- [ ] Title cap heights match the size table ±3 px (132 px hero → 96 px cap).
- [ ] First product UI appears by 6.0 s.

**Every window shot**
- [ ] The rest window is 1560x800 ±4 px at x 180, y 100 (find the window bbox: pixels ≥ 252 on > 35% of a row/column).
- [ ] Corner radius 20 to 24 px; a soft shadow darkens the background by ≥ 20 levels just under the bottom edge.
- [ ] App body text cap height ≥ 18 px at rest.
- [ ] No empty sidebar or blank panel takes more than 15% of the window.
- [ ] Entry: window top edge goes from ≥ 860 to 100 within 0.7 s ±0.1, mostly in the first half (ease-out).
- [ ] No frame between two window shots shows only the background (except a title card).
- [ ] No uninterrupted window shot is longer than 8 s.

**Every zoom**
- [ ] The whole window scales (its edges move); content does not zoom inside a fixed frame.
- [ ] Peak window width is 1794 ±10 px (1.15x), and the window keeps ≥ 40 px clear of every frame edge.
- [ ] Move takes 1.0 to 1.2 s; window width at the midpoint is within 10 px of the average of start and end widths (symmetric ease).
- [ ] Hold at zoom is 2.4 to 4.5 s.

**Highlights and callouts**
- [ ] Each highlight is 3 px `#E2483C` ±8 per channel, radius ≈ 12, appears 0.1 to 0.3 s after a zoom lands, and tracks the UI during zoom-out.
- [ ] Pills are centred at y = 962 ±3, 68 ±2 px tall, fully rounded, white with a shadow.
- [ ] Person pills: 50 px avatar, name in ink, role in grey. Statement pills: accent-coloured text, ≤ 6 words.
- [ ] Each pill is on screen 3 to 5 s, enters within 0.1 s of the window landing, and never overlaps a zoomed window.
- [ ] Pill text cap height is 22 ±2 px (30 px Inter 500).

**Cursor**
- [ ] No OS arrow or hand pointer appears in any frame; the cursor is the 24 px blue disc with a white ring.

**Ending**
- [ ] The end card reveals title words in step with narration (each word visible ≤ 0.2 s before it is spoken).
- [ ] The outro has an animated brand transition into a logo lockup that holds ≥ 3 s.
- [ ] Music has faded by the final 3 s; the last frame is the logo, not black.

**Typography (any frame with text)**
- [ ] The painted font is the bundled Inter (check with `CSS.getPlatformFontsForNode` at render time), not a system fallback.
- [ ] Titles use weight 500, not 600 or 700. Tracking is tight (about −3% of size on titles).

---

## 5. Fonts to bundle (all SIL Open Font License 1.1)

1. **Inter (v4, variable `wght` + `opsz`)**. This is the reference's own face: cap height is 0.727 em at every measured size from 30 to 132 px. Bundling it closes the font gap exactly. It has tabular figures and a full Latin Extended set for prices, times and Filipino names. It is the default.
2. **Inter Display** (the `opsz` end of the same variable file). Use it at ≥ 40 px (titles, end card). Display spacing is tighter and the shapes sharper, so 72 to 132 px titles look crisper than the reference without hand-tuned negative tracking. This is the one place we can beat the bar at no cost.
3. **Geist (variable)**. An alternative grotesk with slightly more geometric shapes and similar metrics. Use it for products whose own UI is set in a geometric sans, where Inter would look too close to the app text. It has a matching **Geist Mono** for code-view callouts.

Avoid SF Pro / `system-ui`: Apple's licence forbids bundling it, and it renders as a fallback face on Linux render machines. That is the main reason our current titles and captions look "not even good".
