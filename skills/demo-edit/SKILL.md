---
name: demo-edit
description: Edit recorded demo takes into videos. Builds the review reel of keepers, an Apple-keynote-style cut from demo.json, narrates it (macOS say, your own recordings, ElevenLabs by API key or MCP, or Higgsfield MCP) over an optional music bed with ducking and fades, the promo and how-to cuts from handoff.json (in/out/speed per shot, title cards, voiceover fit check), and 4:5 or 9:16 social versions. Use after recording, when cutting, re-timing, adding voiceover or music, or making vertical versions of a demo.
---

# Demo edit

Run every command from the demo folder (`<demo>`, the one with `demo.json`). Start each one with:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(d=$PWD; while [ "$d" != / ] && [ ! -f "$d/.claude-plugin/plugin.json" ]; do d=$(dirname "$d"); done; [ -f "$d/.claude-plugin/plugin.json" ] && echo "$d" || ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
```

Every render script checks its config against `$P/schemas/` first and prints `PROGRESS` and
`OUTPUT <path>` lines. Look rules: `$P/references/style-guide.md`. The bar every cut must pass: `$P/docs/quality-bar.md`.

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

The cut must reach the quality bar in `$P/docs/quality-bar.md` (section 4 is the checklist). The
engine bakes in every look value; your job is the per-scene fields below, then Step 2b proves it.

1. Fill each scene in `demo.json` from the plan (skill `demo-plan`), the scout rects from the
   recording (skill `demo-record`, `recordings/scout/<scene>.json`) and the contact sheets:

   | Field | What to put | Bar |
   | --- | --- | --- |
   | `trim: [in, out]` | Cut the still head and tail to about 0.8 s and any wait | P4: keep 0.6 s of still UI after each result |
   | `speed` | 1.25 to 1.5 for typing and setup; never on the hero moment | |
   | `crop: [x, y, w, h]` | Source px (the 1920x1080 take) around the UI that matters; widened to 1.95:1 | W2: body text cap >= 18 px, no empty panel over 15% of the window |
   | `zooms: [{at, focus: [x, y], dur}]` | `at` = seconds into the scene when the zoom-in starts, `focus` = source px of what it points at, `dur` = hold | Z5: hold 2.4 to 4.5; Z6: about one every 11 s, only on a point the narration makes |
   | `highlights: [{rect: [x, y, w, h]}]` | The scout rect of the element the narration names; leave `at` out and it shows 0.17 s after the next zoom of that scene lands, and stays until the zoom has eased back | H7: at most 2 on screen |
   | `callouts: [{at, dur, kind, text}]` | `statement` (at most 6 words) or `person` (`text` name, `role`, `avatar` image path) | C8: 3 to 5 s, one at a time; Z7: never during a zoom |
   | cards: `kind`, `accent` | `hero` (title + subtitle), `section` (one question title), `end` (last item: logo, title, tagline, sweep, outro) ; `accent` = the one key word | T9: exactly one accent word |

   Times in a scene are seconds after `trim` and `speed`. Crop width rule of thumb: `w <= 1560 x
   (cap height of body text in the take, px) / 18`. A first-scene pill at `at: 0.76` enters just
   after the window lands. Old fields still build (`zoom` becomes one 1.15x zoom, `caption` a pill)
   but print `WARN`; switch them.

2. Build it, **in the background** and through the heavy-job lock if the workspace has one:
   ```bash
   python3 -I "$P/scripts/build-keynote.py" demo.json
   ```
   Expected: `WARN ...` lines (fix each), `fonts: painted Inter Display Medium, Inter Variable
   (bundled Inter)`, `overlay: N unique frame(s)`, then `recordings/exports/<slug>-keynote-cut.mp4
   (37.2s)` and a `timing:` path. A 40 s cut takes 1 to 3 minutes; graphics are cached, so a
   rebuild after a small edit is faster. Add `--strict` to stop on any warning.

   | If you see | Do this |
   | --- | --- |
   | `WARN ... (C8)` / `(Z5)` / `(T9)` / `(P2)` ... | The id is the quality-bar row. Fix that field and rebuild |
   | `PlanError`-style stop naming `sequence[3] (scene 02).crop` | That field is impossible (outside the take, overlapping pills, zooms overlapping); fix it as the message says |
   | `keynote-render.mjs failed` / `Could not start Chrome` | `bash "$P/scripts/doctor.sh"`; install Chrome or set `CHROME_PATH` |
   | `Chrome painted [...], not the bundled Inter` | `git -C "$P" checkout assets/fonts`, then rebuild |
   | `raw take ... is missing` | Encode or record that take (skill `demo-record`) |

## Step 2b: run the quality-bar checklist (after Step 3, on the narrated cut)

Never call a cut finished until this passes. Do it once now on the silent cut for the picture, and
again on the narrated cut for the sound.

1. Run the automatic checks and save the sample frames:
   ```bash
   python3 -I "$P/scripts/check-cut.py" recordings/exports/<slug>-keynote-cut-narrated.mp4 --frames recordings/exports/checklist
   ```
   Expected: one line per item, `PASS`, `FAIL` (with the measured value and the bar) or `LOOK`, and
   a last line like `31 pass, 0 fail, 3 to look at`. Exit code 0 means no FAIL.
   To see a value yourself: loudness `ffmpeg -i <cut> -af ebur128=peak=true -f null - 2>&1 | tail -12`
   (I, LRA, Peak), streams `ffprobe -v error -show_streams <cut>`, one frame
   `ffmpeg -ss <t> -i <cut> -frames:v 1 /tmp/f.png`.
2. Read every PNG in `recordings/exports/checklist/` (the Read tool shows images). For each `LOOK`
   line, check that frame by eye: body text big enough and no empty panel (W2), the cursor is the
   blue disc with a white ring (K1), boxes sit exactly on the element (H4), nothing is cut off.
3. Fix and repeat until there is no FAIL and every LOOK is fine:

   | FAIL / LOOK | Fix |
   | --- | --- |
   | `E4` bitrate under 3.5 Mbps | Rebuild (two-pass 5 Mbps is the default); report it if it persists |
   | `A2` loudness / `A3` true peak | Re-run narrate.py (it normalises to -14 LUFS, -2 dBTP); a clipped voice file needs remaking |
   | `A6` bed too loud or quiet | `voice.music_gap_db` (default 13) up to make it quieter, down for louder |
   | `A1` narration under 50% | Lengthen voiceover lines to fill their slots (about 2.9 words a second) |
   | `W1` rest window not found | Very light UI on a light background: check the frame; if it looks right, note it |
   | `W2` text too small / empty panel | Tighten `crop` |
   | `Z2-Z3` / `Z4` | Do not hand-tune: they come from the engine; report a bug if they fail |
   | `C1-C2` pill box wrong | Something covers the band under the window (a zoom); move the callout |
   | `C8/Z7` | Shorten `dur` to 3 to 5 s, or move `at` out of the zoom |
   | `H1-H5` | Leave `at` out so it follows the zoom; check the scout rect |
   | `P2` shot over 8 s | Add a zoom or cut the scene with `trim` |
   | `K1-K2` OS arrow in the footage | The take was recorded with another cursor; re-record with `PROJECT.cursor = 'dot'` |
   | `X2` / `X3` | The last item must be a card (`kind: end`, `outro` > 0) |

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

   `voice.elevenlabs.keychain_service` in demo.json can hold the item name too (never the key); it must start with `elevenlabs` and is used only with `--voice elevenlabs`.
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

6. **Music bed** (required by the bar, A6). `--export-lines` also writes `music/README.txt` with
   the cut length. Pick a source:

   | Music source | How |
   | --- | --- |
   | User's own file | Copy it to `music/bed.m4a`. Instrumental, and music they have the rights to |
   | Free, made here | `python3 -I "$P/scripts/make-bed.py" music/bed.m4a --seconds 60` (a calm pad, ffmpeg only) |
   | ElevenLabs MCP | `compose_music` with a short prompt ("calm modern instrumental for a product demo"), `force_instrumental: true`, `music_length_ms` from `voiceover/lines.json`; move the file to `music/bed.m4a` |
   | Higgsfield MCP | `generate_audio` with a music model (for example `suno_music`, instrumental, `duration` in seconds); wait for the job; `curl -fsSL -o music/bed.m4a "<result url>"` |

   Then set it in demo.json and render again: `"voice": {"music": "music/bed.m4a", "music_dips":
   [{"at": 20.3, "dur": 1.6}]}`. Leave `music_volume` out: narrate.py sets the bed 13 dB under
   the narration (`music_gap_db`), ducks it under speech, dips it at each `music_dips` moment (pick
   one key visual beat, in cut seconds from the timing file), and with an end card fades it out
   over 4 s so the last 3 s are silent. It prints `loudness: I -14.0 LUFS, true peak -2.1 dBTP`.

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
- [ ] `build-keynote.py` printed no `WARN` you did not decide to accept (and say why to the user)
- [ ] `narrate.py --dry-run` shows no line running long, and the narrated cut plays
- [ ] The narrated cut has a music bed, or the user chose no music
- [ ] `check-cut.py` on the narrated cut reports 0 FAIL, and you read every frame it saved and
      every LOOK item holds; tell the user the summary line and anything accepted below the bar
- [ ] If an editor is involved: `build-handoff.py` printed `voiceover fits`
- [ ] Each social version's contact sheet shows nothing cut off
