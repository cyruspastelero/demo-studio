---
name: demo-cardboard
description: Optional finishing path for a demo video in Cardboard. Takes the cut that demo-edit built from handoff.json, puts it on a new Cardboard timeline, then adds generated narration, synced captions and music and exports the finished video. Use only when the user asks to finish, narrate, caption or export a demo in Cardboard and the `cb` CLI is installed. Without Cardboard, use demo-edit and demo-handoff instead.
---

# Demo finish in Cardboard (optional)

`P` is this plugin's root, `${CLAUDE_PLUGIN_ROOT}` (if unfilled, `ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1`).
Read `$P/references/cardboard.md` first. If a Cardboard skill is installed, load it too; it is the
authority on `cb` and `timeline.tsx`.

## 0. Check

`command -v cb || command -v cardboard`. On macOS the CLI may also be at
`/Applications/Cardboard.app/Contents/Resources/cli/bin/cardboard`. If none is found, say that
Cardboard is optional and continue with the built-in path (demo-edit, demo-handoff). Do not ask the
user to install it.

## 1. Build the cut first

The cut is decided in `handoff.json`, as in demo-edit. Build it and confirm it printed `voiceover fits`:

```bash
python3 -I "$P/scripts/build-handoff.py" handoff.json --no-zip
python3 -I "$P/scripts/cardboard-timeline.py" handoff.json <KEY>
```

## 2. New project, then the timeline

```bash
cb project create "<demo> <key>"
cb source check "<demo> <key>" recordings/editor-handoff/cardboard/<KEY>.timeline.tsx
cb source apply "<demo> <key>" recordings/editor-handoff/cardboard/<KEY>.timeline.tsx
```

Only ever apply the generated file to a new, empty project. `check` must report no removed items.

## 3. Narration

Tell the user that narration uses their Cardboard credits. Generate line 1 from
`<KEY>.narration.json`, agree on the voice, then the rest:

```bash
cb generate voice "<demo> <key>" "<text>" --voice "<name>" --start <start> --target-duration <window> --track Voiceover
```

If a line comes back longer than its `window`, shorten it in `handoff.json` and regenerate that line.

## 4. Captions, music, check

```bash
cb audio captions "<demo> <key>" --apply
cb generate music "<demo> <key>" "<style>" --auto --dry-run
cb verify "<demo> <key>"
cb look "<demo> <key>" --range 0,10 --every 2 --sheet /tmp/review.jpg
```

Look at the sheet: captions inside the frame and not over the UI being shown, no clipped clips.

## 5. Export and file

Export only when the user wants the file: `cb export "<demo> <key>" final/<demo>-<key>.mp4`.
Then follow demo-handoff's wrap-up: status, index row, throwaways, frames.

## Rules

- Real footage only: no generated video or images in a product demo.
- Narration claims only what the footage proves (the claims list).
- To change the cut, change `handoff.json`, rebuild and start a fresh project. To polish, edit the
  project's own `timeline.tsx` in small steps.
