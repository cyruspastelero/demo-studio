---
name: demo-edit
description: Edit recorded demo takes into videos. Builds the review reel of keepers, an Apple-keynote-style cut from demo.json, narrates it (macOS say, your own recordings, ElevenLabs by API key or MCP, or Higgsfield MCP) over an optional music bed with ducking and fades, the promo and how-to cuts from handoff.json (in/out/speed per shot, title cards, voiceover fit check), and 4:5 or 9:16 social versions. Use after recording, when cutting, re-timing, adding voiceover or music, or making vertical versions of a demo.
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

## Step 3: narrate (the built-in finish)

1. Every voiced item in `demo.json` needs a `voiceover` line (rules: `$P/references/voiceover.md`).
2. Pick the voice. Check, do not ask, unless the last row applies:

   | Voice source | How to tell it is available | Provider | Cost |
   | --- | --- | --- | --- |
   | Own recordings or MCP files | `<demo>/voiceover/01.mp3` (or .wav, .m4a) exists | `files` | Free, or what the MCP tool charged |
   | ElevenLabs API key | `[ -n "$ELEVENLABS_API_KEY" ] && echo set` prints `set`, or `ELEVENLABS_KEYCHAIN_SERVICE` names a Keychain item | `elevenlabs` | User's plan; cached lines are free |
   | ElevenLabs MCP | The `text_to_speech` tool from an ElevenLabs MCP server is loaded in this session | `files`, via the MCP route below | User's plan |
   | Higgsfield MCP | The `generate_audio` tool from the Higgsfield MCP server is loaded | `files`, via the MCP route below | Higgsfield credits |
   | macOS say | `command -v say` finds it | `say` | Free |
   | None of these | | Ask: record `voiceover/01.mp3`, `02.mp3`..., set an ElevenLabs key, or connect an MCP server | |

   Higgsfield has no key-based route: its public API documents image and video models only, no
   text to speech, so it works through its MCP server.

   Use an MCP or a paid key only when the user asked for that voice or already set it up; otherwise
   take the first free row that applies.

3. **Keys.** Never ask the user to paste an API key into chat, into any file, or into a commit.
   If they want ElevenLabs by key, tell them to run one of these in the shell they start Claude
   Code from, then restart the session:

   ```bash
   export ELEVENLABS_API_KEY=...                                  # this shell only
   security add-generic-password -a "$USER" -s elevenlabs-api -w  # or keep it in the macOS Keychain (it asks for the key)
   export ELEVENLABS_KEYCHAIN_SERVICE=elevenlabs-api              # ...and tell narrate.py its name
   ```

   `voice.elevenlabs.keychain_service` in demo.json can hold the item name too (never the key).
   The environment variable wins. Rendered lines are cached in `recordings/voice-cache/`.

4. **The MCP route** (ElevenLabs MCP or Higgsfield MCP). narrate.py does not call MCP tools; you
   make one audio file per line and narrate.py places them:
   1. Write the line list: `python3 -I "$P/scripts/narrate.py" demo.json --export-lines`. It
      writes `voiceover/lines.json` (per line: `index`, `item`, `label`, `text`, `file`, `start`,
      `budget`, `suggested_words`) and `voiceover/README.txt`.
   2. Read `voiceover/lines.json`. If a line has more words than `suggested_words`, shorten its
      `voiceover` in demo.json first and export again.
   3. For each line, in order, with the same voice every time:
      - ElevenLabs MCP: call `text_to_speech` with `text` set to the line's `text` and
        `output_directory` set to `<demo>/voiceover`. It saves a file under its own name. Move it
        to the line's `file`, for example `mv "<saved path>" voiceover/01.mp3`.
      - Higgsfield MCP: call `generate_audio` with the line's `text` as `prompt` and its default
        speech model, wait for the job with `jobs_wait`, then download the result URL:
        `curl -fsSL -o voiceover/01.mp3 "<result url>"`. Several lines at once:
        `generate_audio_batch`.
   4. Check and render: `python3 -I "$P/scripts/narrate.py" demo.json --voice files --dry-run`,
      then without `--dry-run`. If files are missing it lists every missing `voiceover/NN.mp3`
      with its text and the next command.

5. Check the timing, then render:
   ```bash
   python3 -I "$P/scripts/narrate.py" demo.json --dry-run
   python3 -I "$P/scripts/narrate.py" demo.json                 # add --voice say|elevenlabs|files to force one
   ```
   Expected: `narrate: voice <name>, N line(s), cut 52.4s`, a table of lines, then
   `recordings/exports/<slug>-keynote-cut-narrated.mp4 (52.4s)`.

   | If you see | Do this |
   | --- | --- |
   | `lines run into the next voiced part` | Cut words from that line, lower a scene's `speed`, or lengthen a card; rebuild Step 2 |
   | `the keynote cut ... does not exist yet` | Do Step 2 |
   | `sequence changed since the cut was built` | Re-run build-keynote.py, then narrate again |
   | `needs the ELEVENLABS_API_KEY environment variable` | Use another voice, or ask the user to export the key (step 3) |
   | `Keychain item ... was not found` | The user stores it with the `security add-generic-password` line it prints |
   | `N of M voiceover file(s) are missing` | Make the listed `voiceover/NN.mp3` files (step 4), then run with `--voice files` |
   | `music file not found` | Fix `voice.music` in demo.json or drop `--music` |

6. **Music bed** (the finished video should have one unless the user says no). `--export-lines`
   also writes `music/README.txt` with the cut length. Pick a source:

   | Music source | How |
   | --- | --- |
   | User's own file | Copy it to `assets/music.mp3`. Instrumental, and music they have the rights to |
   | ElevenLabs MCP | `compose_music` with a short prompt ("calm modern instrumental for a product demo"), `force_instrumental: true`, `music_length_ms` from `voiceover/lines.json`, `output_directory` the demo folder; move the file to `assets/music.mp3` |
   | Higgsfield MCP | `generate_audio` with a music model (for example `suno_music`, instrumental, `duration` in seconds); wait for the job; `curl -fsSL -o assets/music.mp3 "<result url>"` |
   | None | Skip it; the narrated cut works without music |

   Then set it in demo.json and render again:
   `"voice": {"music": "assets/music.mp3", "music_volume": 0.12, "music_fade_in": 1.0, "music_fade_out": 2.0}`.
   The bed loops, ducks under speech, and fades (defaults: no fade in, 1.5s fade out). `--music
   <path>` overrides `voice.music` for one run.
7. Listen: `open recordings/exports/<slug>-keynote-cut-narrated.mp4`.

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

## Done when

- [ ] The user has seen `recordings/exports/review-reel.mp4` and agreed the takes
- [ ] The keynote cut's contact sheet shows captions, zooms and cards in place
- [ ] `narrate.py --dry-run` shows no line running long, and the narrated cut plays
- [ ] The narrated cut has a music bed, or the user chose no music
- [ ] If an editor is involved: `build-handoff.py` printed `voiceover fits`
- [ ] Each social version's contact sheet shows nothing cut off
