# Finishing in Cardboard (optional)

demo-studio never needs Cardboard. The built-in path (ffmpeg) gives rough assemblies, scripts and a
zip for a human editor. If you have the Cardboard desktop app and its `cb` command line tool, Claude
can also finish the video itself: narration, captions, music and the export.

| | Built in | Cardboard |
| --- | --- | --- |
| Needs | ffmpeg | The Cardboard app, signed in, with `cb` installed (File > Install Agent Tools...) |
| Cuts, speed changes, title cards | `build-handoff.py` | The same clips, imported |
| Narration | Script with timecodes for a voice tool or a person | Generated on the timeline (uses Cardboard credits) |
| Captions and music | Left to the editor | `cb audio captions`, `cb generate music` |
| Result | Editor handoff zip | A finished mp4, and a project a person can keep editing |

## How it fits together

Cardboard starts where the built-in path stops, so nothing is decided twice:

1. `build-handoff.py handoff.json` cuts every shot (in, out, speed) and renders the title cards into
   numbered clips, and checks that the voiceover fits.
2. `cardboard-timeline.py handoff.json` writes `editor-handoff/cardboard/<KEY>.timeline.tsx` (those
   clips back to back) and `<KEY>.narration.json` (each line, its start, and the seconds it has).
3. A **new** Cardboard project takes the timeline, then the narration, captions and music.

`handoff.json` stays the source of truth for the cut. To change an in point or reorder shots, change
`handoff.json`, rebuild, and make a fresh project. Polish that only exists in Cardboard (music,
captions, a grade) is done in Cardboard.

## Commands

```bash
python3 -I "$P/scripts/build-handoff.py" handoff.json --no-zip
python3 -I "$P/scripts/cardboard-timeline.py" handoff.json PROMO      # --aspect 9:16 for vertical
cb project create "<demo> promo"
cb source check "<demo> promo" recordings/editor-handoff/cardboard/PROMO.timeline.tsx
cb source apply "<demo> promo" recordings/editor-handoff/cardboard/PROMO.timeline.tsx
```

Then, for each entry in `PROMO.narration.json`:

```bash
cb generate voice "<demo> promo" "<text>" --start <start> --target-duration <window> --track Voiceover
```

And to finish:

```bash
cb audio captions "<demo> promo" --apply
cb generate music "<demo> promo" "<style>" --auto --dry-run     # look at the sections, then run without --dry-run
cb verify "<demo> promo"
cb look "<demo> promo" --at 3,20,60 --sheet /tmp/review.jpg
cb export "<demo> promo" final/<demo>-promo.mp4                  # only when the file is wanted
```

`cb docs <topic>` prints the full documentation for any command.

## Rules

- **Apply the generated timeline only to a new, empty project.** Applying a whole file replaces what
  is there: on a project with existing work it removes every item the file does not list. Always
  run `cb source check` first and read what it would remove. After the first apply, change the
  project with small edits to its own `timeline.tsx`.
- Narration and music spend the Cardboard account's credits. Say so before generating, and generate
  one line first to agree on the voice.
- A line that runs past its `window` overlaps the next one. Shorten the line in `handoff.json`
  rather than speeding the voice past natural pace.
- Do not start the Cardboard app yourself. `cb look` and `cb export` need it running; editing,
  `verify` and the `media` and `audio` commands do not.
- The claims list still applies: generated narration says only what the footage proves.
- Real footage only. Do not generate video or images into a product demo.
