---
name: demo-edit
description: Edit recorded demo takes into videos. Builds the review reel of keepers, an Apple-keynote-style cut from demo.json, narrates it for free (macOS say, your own recordings, or optional ElevenLabs) with an optional music bed, the promo and how-to cuts from handoff.json (in/out/speed per shot, title cards, voiceover fit check), and 4:5 or 9:16 social versions. Use after recording, when cutting, re-timing, adding voiceover or music, or making vertical versions of a demo.
---

# Demo edit

Run every command from the demo folder (`<demo>`, the one with `demo.json`). Start each one with:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
```

Every render script checks its config against `$P/schemas/` first and prints `PROGRESS` and
`OUTPUT <path>` lines. Look rules (zoom, captions, cards, music): `$P/references/style-guide.md`.

## Step 1: review reel (always first)

```bash
python3 -I "$P/scripts/review-reel.py" recordings --config demo.json && open recordings/exports/review-reel.mp4
```

Expected: `recordings/exports/review-reel.mp4 (34.2s, 3 takes: ...)`.

| If you see | Do this |
| --- | --- |
| `WARN no keeper for 04-...` | That scene has no `keep` row in `recordings/takes.csv`. Mark one or record it |
| `keeper ... is in takes.csv but not on disk` | Fix the file name in takes.csv or re-encode the take |

Show the reel to the user and agree on the takes before cutting.

## Step 2: keynote cut (from demo.json)

1. Tune each scene in `demo.json` from the take notes and contact sheets:

   | Field | Default | Set it when |
   | --- | --- | --- |
   | `trim: [in, out]` | whole take | Always: cut the still head and tail to about 0.8s and any wait |
   | `speed` | 1 | 1.25 to 1.5 for form filling and setup; never on the hero moment |
   | `zoom: [factor, cx, cy, start, dur]` | none (1.05 push-in) | Only the hero moment: factor 1.5 to 1.75, dur 0.6 to 1.4 |
   | `caption` | none | Every scene: one short sentence with a period |

   Pick zoom centres from a contact sheet (1920x1080 coordinates). Two or three zooms per cut.

2. Render the caption and card images, then the cut:
   ```bash
   export PLAYWRIGHT_MCP_OUT="<cwd>/.playwright-mcp"
   python3 -I "$P/scripts/mk-assets.py" demo.json
   ```
   Expected: a path ending in `_assets.run.js`. Call `browser_run_code` with that `filename`. Its
   result has `paintedFonts`; on macOS it must include `.SFNS`. Then, **in the background**:
   ```bash
   python3 -I "$P/scripts/build-keynote.py" demo.json
   ```
   Expected last lines: `recordings/exports/<slug>-keynote-cut.mp4 (52.4s)` and a `timing:` path.
   It takes about one second of CPU per second of output. Rebuild single parts with
   `build-keynote.py demo.json 05 card-intro`.
3. Check it: `bash "$P/scripts/sheet.sh" recordings/exports/<slug>-keynote-cut.mp4 /tmp/cut.png 12`
   and read `/tmp/cut.png`: captions under the window, zooms on the right spot, no cut-off text.

## Step 3: narrate (the default free finish)

1. Every voiced item in `demo.json` needs a `voiceover` line (rules: `$P/references/voiceover.md`).
2. Pick the voice. Check, do not ask, unless the last row applies:

   | Check | Voice | Cost |
   | --- | --- | --- |
   | `<demo>/voiceover/01.wav` (or .mp3, .m4a) exists | `files`: the user's own recordings, one per line | Free |
   | `[ -n "$ELEVENLABS_API_KEY" ] && echo set` prints `set` | `elevenlabs` | User's ElevenLabs plan; cached lines are free |
   | `command -v say` finds it (macOS) | `say` | Free |
   | none of these | Ask: record their own lines as `voiceover/01.wav`, `02.wav`... or set an ElevenLabs key | |

   **Never ask the user to paste an API key into chat or into any file.** If they want ElevenLabs,
   tell them to run `export ELEVENLABS_API_KEY=...` in the shell they start Claude Code from, then
   restart the session. Lines are cached in `recordings/voice-cache/`, so re-runs cost nothing.

3. Check the timing, then render:
   ```bash
   python3 -I "$P/scripts/narrate.py" demo.json --dry-run
   python3 -I "$P/scripts/narrate.py" demo.json                 # add --voice say|elevenlabs|files to force one
   ```
   Expected: `narrate: voice <name>, N line(s), cut 52.4s`, a table of lines, then
   `recordings/exports/<slug>-keynote-cut-narrated.mp4 (52.4s)`.

   | If you see | Do this |
   | --- | --- |
   | `lines that run into the next one` | Cut words from that line, lower a scene's `speed`, or lengthen a card; rebuild Step 2 |
   | `... is missing; run build-keynote.py first` | Do Step 2 |
   | `sequence changed since the cut was built` | Re-run build-keynote.py, then narrate again |
   | `needs the ELEVENLABS_API_KEY environment variable` | Use `--voice say`, or ask the user to export the key |
   | `needs voiceover/...` | A recording is missing for that line number |
   | `music file not found` | Fix `voice.music` in demo.json or drop `--music` |

4. Music (only if the user asks): add `"voice": {"music": "assets/bed.mp3", "music_volume": 0.12}`
   to demo.json, or pass `--music assets/bed.mp3`. Music the user has the rights to; no vocals.
5. Listen: `open recordings/exports/<slug>-keynote-cut-narrated.mp4`.

## Step 4: promo and how-to (handoff.json, for an editor)

Fill `handoff.json` (shape `$P/schemas/handoff.schema.json`, example `$P/examples/todo-sample/handoff.json`):
`videos` (usually `PROMO` about 1:30 and `HOW-TO` about 3:00), each with `scenes` that have a
`name`, a `voiceover` line and `shots`. A shot is a clip `{source, in, out, speed, screen, text}`,
a card `{card, length, text}`, or `{ref: NAME}` from `shots`. Also `cards`, `brand`, `parts`, `brief`.

```bash
node "$P/scripts/title-cards.mjs" handoff.json             # add --social for caption bands
python3 -I "$P/scripts/build-handoff.py" handoff.json      # add --no-say off macOS
```

Expected: one line per video folder (`<folder>: 12 clips, 1:28.0`) and `voiceover fits`. If it prints
`VOICEOVER PROBLEMS: PROMO line 3 (...) runs 9.1s but has 7.4s`, cut words or lower that shot's `speed`, then
rebuild. On macOS it also writes `reference/<VIDEO>-VOICEOVER-TIMING-PREVIEW.mp4`. Packaging: skill `demo-handoff`.

## Step 5: social versions (4:5 and 9:16)

```bash
python3 -I "$P/scripts/social-cut.py" recordings/exports/<slug>-keynote-cut-narrated.mp4 recordings/exports/<slug>-9x16.mp4 --aspect 9:16 --fit crop --focus-x 0.5
```

| Choice | Default | Other |
| --- | --- | --- |
| `--aspect` | `4:5` (1080x1350) for feeds | `9:16` (1080x1920) for stories and shorts |
| `--fit` | `crop` around `--focus-x`/`--focus-y` (0 to 1), so text reads on a phone | `contain` when the whole screen matters |
| `--fill` | `blur` | `color` with `--color` and a brand hex |

Or list entries under `social` in handoff.json and build-handoff.py makes them. One focus per entry.
If doctor.sh said there is no `drawtext`, run `title-cards.mjs handoff.json --social` first.
Check each with `bash "$P/scripts/sheet.sh" <file> /tmp/s.png 8` for cut-off content.

## Step 6: let a person tweak it (optional)

When the user wants to adjust in and out points, reorder shots or reword text themselves:

```bash
npm --prefix "$P" run studio <demo>        # run_in_background: true; first run: npm install --prefix "$P"
```

It reads and writes the same `handoff.json` and `demo.json`. Re-read both before you change them.
It never writes a file that fails the schema, and keeps `_` keys.

## Step 7: finish in Cardboard (optional, only if asked)

Only when the user asks for Cardboard and `command -v cb` finds it: skill `demo-cardboard`.
Everything above works without it.

## Done when

- [ ] The user has seen `recordings/exports/review-reel.mp4` and agreed the takes
- [ ] The keynote cut's contact sheet shows captions, zooms and cards in place
- [ ] `narrate.py --dry-run` shows no line running long, and the narrated cut plays
- [ ] If an editor is involved: `build-handoff.py` printed `voiceover fits`
- [ ] Each social version's contact sheet shows nothing cut off
