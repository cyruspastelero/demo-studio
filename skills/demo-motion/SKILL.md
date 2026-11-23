---
name: demo-motion
description: Make a short, beat-synced motion-graphics launch ad from a demo's real footage. Writes a storyboard.json (kinetic type, tilted UI panels, a typed prompt, progress tiles, a Done burst, aspect-ratio morphs, a logo lock-up) from the demo's plan or a short brief, picks a motion template (airy, daylight, nocturne, showroom), gets music, renders 16:9, 4:5 and 9:16 at -14 LUFS and checks a contact sheet. Use when the user says "make a launch ad", "motion graphics", "make an ad", "a promo with music and no voice", or wants a teaser of a demo.
---

# Demo motion (launch ads)

A launch ad is 20 to 45 seconds of words and real product UI cut to music, with no narration. It
works muted. The engine is `$P/motion/` and the full reference is `$P/docs/motion.md`: storyboard
format, the 16 scene types and their parameters, styles, beat sync. The demo-studio launch ad in
`$P/examples/launch-ad/` is a complete, real example; read its `storyboard.json` before writing one.

Do not ask the user anything here. Decide, and write each decision in `motion/README.md` in the demo
folder. Stop only for the stops in skill `demo-studio`. Rules that always hold:

- **Real UI only.** Every panel, card and device shows the demo's own recordings or screenshots.
  Never generated images of the product.
- **Say only what is true.** Every claim on screen must be something the product does. No made-up
  numbers, customers or reviews.
- **No other people's assets.** If the user shows a reference ad, take the style only (see
  "Copying a style"), never its footage, words, logo or colours.

Start every shell command with this line (it finds the plugin folder):

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(d=$PWD; while [ "$d" != / ] && [ ! -f "$d/.claude-plugin/plugin.json" ]; do d=$(dirname "$d"); done; [ -f "$d/.claude-plugin/plugin.json" ] && echo "$d" || ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
```

Renders are heavy. Run them one at a time; on a shared machine wrap each in the heavy-job lock if the
workspace has one.

## Step 1: set up the folder

Work in the demo's folder (`demos/<name>/`). If there is no demo yet, make the ad from whatever the
user gives (screenshots, a screen recording) in a new folder `demos/<name>/`.

```bash
mkdir -p motion/media motion/out
```

Expected: `motion/` with `media/` (stills, clips, music) and `out/` (renders).

## Step 2: write the story (about 10 beats)

Read the demo's `PLAN.md` / `demo.json` (goal, story arc, voiceover draft) or the user's brief. Write
8 to 12 beats, each one line of on-screen text plus what is on screen, in this shape:

1. Hook: the pain, in 3 short phrases (one accent word).
2. Who it is for, over floating cards of finished frames.
3. The turn: what changes (logo mark pops in).
4. The ask: the one input, typed into an isolated prompt box, cursor clicks send.
5. The work: tiles for the stages lighting up, a progress bar, one true status line.
6. Done: check plus confetti, then the real result in a tilted window.
7. One power feature, zoomed into the real UI (`uiFocus`), with a two-word line.
8. Formats or integrations (`aspectMorph`, `cardScatter`, `featureList`).
9. A three-part promise line ("Fast. Private. Yours.").
10. Lock-up: logo, name, URL.

Plain words, short phrases (2 to 5 words), no em dashes, one accent word per phrase marked with
asterisks: `"took me *an afternoon.*"`. Every phrase needs at least 0.8 s on screen before the next one
replaces it; `at` counts **beats** when the storyboard has a tempo (at 120 BPM, `"at": 2` is 1 s).

## Step 3: collect real media

Pull stills and short clips from the demo's takes and exports into `motion/media/`:

```bash
ffmpeg -v error -ss 12.0 -i recordings/raw/<take>.mp4 -frames:v 1 -q:v 3 motion/media/still-1.jpg
ffmpeg -v error -ss 20.5 -to 24.0 -i recordings/exports/<cut>.mp4 -an -vf scale=1280:-2 -c:v libx264 -crf 26 motion/media/result.mp4
```

Expected: each command writes one file and prints nothing. Pick moments with the cursor doing
something (a click, typing, a result appearing). Keep clips 2 to 7 s.

**Zooms need pixels.** A `uiFocus` region `w` wide fills the frame, so the clip needs about `1920 / w`
pixels across. A normal take is 1920 wide, so zooming into half of it (`w` 0.5) doubles every pixel and
looks soft. For any zoom tighter than about `w` 0.75, record a close-up take instead: zoom the page
(CSS `zoom` on the panel) so the part you will focus fills most of the viewport, and encode it at full
resolution:

```bash
OUT_SIZE=2880x1620 bash "$P/scripts/encode-take.sh" frames/_tmpNN 07c-rename-closeup "close-up for the zoom"
```

Then use a wide `focus` (about 0.75 or more) on that take. A storyboard can also point
at a take directly with `{ "src": "...", "from": 12.2, "to": 18.6, "rate": 1.6 }`.

## Step 4: get music

The ad is cut to the music, so get the track before timing scenes. In order of preference:

1. **The user's own licensed track**: copy it to `motion/media/music.mp3`.
2. **ElevenLabs MCP `compose_music`**: prompt for "modern upbeat tech product launch music,
   instrumental, no vocals, 120 BPM, four-on-the-floor kick, two soft intro bars, a clear drop at
   bar 3, a one-bar stop about two thirds through, a final hit and a short clean tail",
   `music_length_ms` about 2 s longer than the ad, `force_instrumental: true`, `output_directory`
   `motion/media`. Rename the file to `music.mp3`.
3. **No account or no credits**: ask the user for a track (this is a stop: say why).

| If you see | Do this |
| --- | --- |
| 422 when passing a `composition_plan` with `force_instrumental` | Drop `force_instrumental`; put "instrumental, no vocals" in the plan's styles instead |
| 422 `seed cannot be used with prompt` | Drop `seed` (it only works with a composition plan) |
| `quota_exceeded` | Not enough credits for the length. Shorten the track, or use option 1 or 3 |
| The tool cannot write to the folder | Save to a folder it allows, then copy the file in |

Then measure the beat:

```bash
node "$P/motion/analyze-beats.mjs" motion/media/music.mp3 --out motion/media/music.beats.json
```

Expected: one line like `{"bpm":119.999,"offset":0.0174,"onsets":117,"duration":37.042}`. Listen for
(or read from the onsets) the drop and the stop; put the turn of the story on the drop.

## Step 5: write the storyboard

Copy `$P/examples/launch-ad/storyboard.json` to `motion/storyboard.json` and replace the brand,
the media paths and the text with this demo's. Keep:

- `"timing": { "beatsFrom": "media/music.beats.json", "start": 0 }` and every scene in `beats`
  (at 120 BPM a beat is 0.5 s; 2 to 8 beats per scene; big moments on multiples of 4).
- `"audio": { "music": "media/music.mp3", "fadeOut": 1.2, "sfxGainDb": -14, "loudness": -14, "truePeak": -1.5 }`.
  The SFX kit is built in.
- `brand.accent` (hex), `brand.logo`, `brand.url`, and `brand.fonts` only if the product has its own.

Check it:

```bash
node "$P/motion/render-motion.mjs" motion/storyboard.json --check
```

Expected: `{"ok":true,"style":"airy","duration":36,...}`.

| If you see | Do this |
| --- | --- |
| `scenes[3].labels: expected at least 2 item(s)` | Fix that field of that scene (the path names it) |
| `scenes[7].media.src: file not found: x.mp4` | Fix the path; paths are relative to the storyboard |
| `is not a known field` | A typo or a parameter of another scene type; see docs/motion.md "Scene types" |
| `needs timing.bpm or timing.beatsFrom` | Add `timing.beatsFrom`, or use `duration` (seconds) |
| `"warnings": ["scenes[10] uiFocus stretches ... 2.0x and will look soft ..."]` | Record a close-up take or encode at `OUT_SIZE=2880x1620` (Step 3), or widen `focus`. Do not ship a soft zoom |

## Step 6: pick a style and check stills

Pick the motion template that fits the product (read `$P/motion-templates/*/README.md`): `airy`
(light and friendly, the default), `daylight` (clean white, rounded type, typed headlines with a caret,
shape-sweep transitions; for bright productivity-suite style launch films), `nocturne` (dark and
premium), `showroom` (grey and deep blue, devices, hard cuts). Set `"style"` in the storyboard. Render stills at the middle of every scene:

```bash
node "$P/motion/render-motion.mjs" motion/storyboard.json --size 16x9 --stills 2,6,9.5,13,17,21 --stills-dir motion/stills
```

Expected: one PNG per time in `motion/stills/` and a JSON line ending in `"shots":6`. Read them.
Check that text is readable, nothing touches the frame edge, and the UI shown is the right moment.
Repeat with `--size 9x16`.

| If you see | Do this |
| --- | --- |
| `text does not fit even at 44px: "..."` | Shorten that phrase or split it into two phrases |
| `phrase "..." is on screen for 0.45 s before the next one replaces it` | Move the next phrase's `at` later (beats, not seconds) or shorten the first phrase |
| `tile labels too long` / `button label too long` | Shorter labels |
| `runtime load failed` | The message names the scene or asset; fix it and re-run |
| `Executable doesn't exist` / no Chrome | Install Google Chrome (`bash "$P/scripts/doctor.sh"` prints the fix) |

## Step 7: render the three sizes

```bash
for s in 16x9 4x5 9x16; do node "$P/motion/render-motion.mjs" motion/storyboard.json --size $s --out motion/out/ad-$s.mp4; done
```

Expected per size: progress lines, then `{"ok":true,...,"loudness":{"integrated":-14,"truePeak":-1.4}}`.
A 36 s ad takes about 6 minutes per size.

## Step 8: check before calling it done

```bash
node "$P/motion/contact-sheet.mjs" motion/out/ad-16x9.mp4 --fps 4
node "$P/motion/contact-sheet.mjs" motion/out/ad-9x16.mp4 --fps 4 --cols 16 --width 140
```

Read both sheets. Look for: an empty frame for more than one tile (0.25 s), text cut by the edge or
hidden behind a panel, a scene that starts before the previous one has gone, a word under 44 px at
1080 wide, the wrong UI moment. Fix the storyboard and re-render only what changed (`--from`/`--to`
renders a window for a quick look).

Then make the poster and the GIF:

```bash
ffmpeg -v error -y -ss 34.6 -i motion/out/ad-16x9.mp4 -frames:v 1 -q:v 2 motion/out/poster.jpg
ffmpeg -v error -y -i motion/out/ad-16x9.mp4 -vf "fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" motion/out/ad-16x9.gif
```

Delete `motion/.motion-cache/` and `motion/stills/` when you are done.

## Copying a style

Copy the feel (pace, type, colour mood, how UI floats and zooms), never the reference's marks: no
logo shapes, mascots, signature icons or sounds. A shape that looks like a famous brand's mark (for
example a big four-point star, which reads as a well-known AI assistant's logo) is out; use plain
geometry in the product's own accent, such as `shapeSweep`. Music from the reference is someone
else's recording: never use it, even in a draft. Match its tempo and feel with a track you have the
rights to (Step 4).

To make the ad look like a reference the user may use as a reference, follow "Adding a style" in
`$P/docs/motion.md`: measure it with the scripts in `$P/motion/analysis/` (cuts, colours, type,
easing, panels, tempo), write `ANALYSIS.md` and a new `style.json` in
`<demos>/_motion-templates/<name>/` (render with `MOTION_TEMPLATES_DIR=<demos>/_motion-templates`
set), compare side by side with
`$P/motion/analysis/side-by-side.sh`, and keep the reference out of the deliverables.

## Done when

- `motion/out/ad-16x9.mp4`, `ad-4x5.mp4`, `ad-9x16.mp4` exist, each reports -14 LUFS integrated and a
  true peak under -1 dBTP.
- You read a contact sheet of each size and the frames at every scene change, and looked at every
  zoom at full size (a still at 1920 wide): text in the zoom is as sharp as the headline.
- `--check` printed no `warnings`.
- Every claim on screen is true and every UI shot is the demo's own.
- `motion/README.md` lists the decisions (story, style, music source and its licence, anything not
  reproduced).
