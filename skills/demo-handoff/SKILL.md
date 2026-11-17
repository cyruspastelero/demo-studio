---
name: demo-handoff
description: Package a demo for the video editor and wrap the shoot up. Builds the editor-handoff folder and zip (READ-ME-FIRST brief, scripts, voiceover files with timecodes, numbered clips and rough assemblies, timing previews, uncut source footage by story part, contact sheets, title cards, brand sheet, social versions), then runs the wrap-up checklist (status, throwaways, key rotation, frames cleanup). Use when a demo is ready to send to an editor or the shoot is finished.
---

# Demo handoff

Run every command from the demo folder (`<demo>`, the one with `handoff.json`). Start each with:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(d=$PWD; while [ "$d" != / ] && [ ! -f "$d/.claude-plugin/plugin.json" ]; do d=$(dirname "$d"); done; [ -f "$d/.claude-plugin/plugin.json" ] && echo "$d" || ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
```

What the editor receives and why: `$P/references/handoff-spec.md`.

## Step 1: fill the brief in handoff.json

The `brief` object becomes `1-READ-ME-FIRST.txt`. Fill every field:

| Field | What goes in it |
| --- | --- |
| `summary` | What the videos are and who they are for, two or three sentences |
| `people` | Everyone on screen: fictional name and role |
| `glossary` | Words the editor may not know |
| `edit_notes` | Zooms for phones, pacing, style reference |
| `fixes` | Things to crop or blur (test-mode banners, sandbox names, stray rows) |
| `do_not_say` | Claims the footage does not prove, or the client forbids |
| `claims` | Every claim the voiceover makes, each visible in the footage |
| `reference_files` | The review reel and any style references |

And `brand` (becomes `assets/brand/BRAND.txt`): spelling, colours, font, logo, taglines.
If a client brief exists, copy its wording into these fields exactly.

## Step 2: build

```bash
node "$P/scripts/title-cards.mjs" handoff.json --social
python3 -I "$P/scripts/build-handoff.py" handoff.json      # add --no-say when not on macOS
```

Expected: one line per video folder, then `voiceover fits`, then an `OUTPUT` line for
`recordings/<slug>-editor-handoff.zip`.

| If you see | Do this |
| --- | --- |
| `VOICEOVER PROBLEMS: ...` | Fix the lines (skill `demo-edit`, Step 4), then build again |
| `WARN part '<name>' matched no takes` | Fix that entry in `handoff.json` `parts` |
| a schema error naming a field | Fix that field in `handoff.json`; compare with `$P/examples/todo-sample/handoff.json` |

For a single keynote cut with no promo and how-to split, run
`python3 -I "$P/scripts/keynote-handoff.py" demo.json` instead.

## Step 3: check before sending

1. Watch each `00_ROUGH-ASSEMBLY.mp4` and timing preview in `recordings/editor-handoff/` end to end.
2. Read `1-READ-ME-FIRST.txt` as the editor: could you finish without asking anything?
3. Look through `reference/take-contact-sheets/` for secrets, personal data and stray test data.
4. Note the zip size. If it is too large, drop unused parts from `parts` and build again.
5. **Cold follow-through** (`$P/references/quality-gates.md` section 4): follow the how-to script
   literally on a fresh test account. If you get stuck or have to guess, fix the script or re-shoot.
6. Tick every entry in `brief.claims` against the footage.
7. Open the folder for the user: `open recordings/editor-handoff`.

## Step 4: when the edit comes back

Save the finished videos to `<demo>/final/`, point the demos index at them, and re-time the
voiceover to the finished cut, not the rough assembly.

## Step 5: wrap-up (done when every box is ticked)

- [ ] The demo README.md Status section says what was made, where, and how to rebuild it
- [ ] The demos index row (`./demos/README.md`) has the status and the final cut's path
- [ ] THROWAWAYS.md lists what is still to delete; delete only after the user signs off
- [ ] The user was reminded to rotate any credential shared in chat or shown on screen, even blurred
- [ ] Demo-only servers (frame receiver, helper servers) are stopped and demo windows closed
- [ ] The user was asked before deleting `recordings/frames/` (several GB). Raw takes and exports stay
- [ ] `app/.env` is in no zip and no commit
- [ ] `python3 -I check.py` in the demos folder (if there is one) reports nothing for this demo
