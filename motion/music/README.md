# Music library

Nine instrumental tracks that ship with demo-studio, free to use in the videos you make with it.
Five are for launch ads, and four are beds to sit under a narrated walkthrough. Every track has a
`.beats.json` (tempo and first beat), so a launch ad can be cut straight to it.

## Pick a track

- **Launch ads** (`ad-*`): 27 to 44 s, a steady groove and a clean ending. Time the turn of the story
  to the measured drop below.
- **Narrated walkthroughs** (`bed-*`): 90 s, steady, with no lead melody, so the voice sits on top.
  Put the bed about 13 dB under the narration (`voice.music_gap_db`). For a longer video, loop it or
  chain a second bed at the same tempo.
- For a launch ad, copy the mp3 and its `.beats.json` into the demo's `motion/media/` as `music.mp3`
  and `music.beats.json`, then point `timing.beatsFrom` at the beats file.
- Don't use the same track for two videos people will see side by side.

## Tracks

`python3 -I profile.py` measures these: tempo and first beat come from `motion/analyze-beats.mjs`,
and the drop, dips and end come from bar-by-bar loudness. Times are seconds into the file.

<!-- tracks:start -->
| Track | Use | BPM | Length | Drop | Dips | Sound ends | LUFS |
|---|---|---|---|---|---|---|---|
| `ad-devtool-electro-120.mp3` | Developer tools, APIs, CLIs. Tight minimal electro with a pulsing arpeggio. Short (27 s), full energy from bar 1, no intro: for 15 to 25 s cuts. | 120.02 | 27s | none | none | 26.3s | -12.3 |
| `ad-fintech-cinematic-110.mp3` | Payments, finance, anything that should feel trustworthy. Strings ostinato, felt piano. | 109.99 | 44.0s | 2.2s | 8.8s | 43.7s | -16.3 |
| `ad-french-house-120.mp3` | Product launch, confident and fun. Filtered French house, funk guitar, brass stabs. | 120.02 | 40.0s | 14.3s | none | 38.3s | -12.5 |
| `ad-indie-electronic-120.mp3` | Consumer app or friendly launch. Bright plucked synths, live bass, handclaps. | 120.04 | 40.0s | 4.0s | none | 40.0s | -16.3 |
| `ad-live-funk-115.mp3` | Playful feature reel. Live funk band, wah guitar, horn hits. | 114.99 | 42.0s | 6.3s | 27.1s | 39.7s | -14.5 |
| `bed-acoustic-light-96.mp3` | Narrated walkthrough, warm and human. Nylon guitar, light piano. | 95.75 | 90.0s | none | none | 88.2s | -14.8 |
| `bed-ambient-pulse-100.mp3` | Narrated walkthrough, modern SaaS. Soft synth pads and a gentle arpeggio. | 132.5 | 90.0s | none | none | 85.3s | -18.7 |
| `bed-tech-minimal-110.mp3` | Narrated technical demo. Muted plucks, round sub bass, soft hats. | 110.0 | 90.0s | none | none | 89.5s | -12.3 |
| `bed-warm-rhodes-90.mp3` | Narrated walkthrough, friendly. Rhodes chords, brushed drums, upright bass. | 90.0 | 90.0s | none | none | 88.0s | -12.6 |
<!-- tracks:end -->

## Add a track

1. Put an instrumental `<name>.mp3` here. Name it `ad-<style>-<bpm>` or `bed-<style>-<bpm>`. Only add
   music you have the rights to share.
2. Add a line for it to `notes.json`. If you made it from a composition plan, save the plan in
   `plans/<name>.json`.
3. Run `python3 -I profile.py`, then listen to the track once before you use it.
