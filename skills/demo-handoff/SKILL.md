---
name: demo-handoff
description: Package a demo for the video editor and wrap the shoot up. Builds the editor-handoff folder and zip (READ-ME-FIRST brief, scripts, voiceover files with timecodes, numbered clips and rough assemblies, timing previews, uncut source footage by story part, contact sheets, title cards, brand sheet, social versions), then runs the wrap-up checklist (status, throwaways, key rotation, frames cleanup). Use when a demo is ready to send to an editor or the shoot is finished.
---

# Demo handoff

`P` is this plugin's root, `${CLAUDE_PLUGIN_ROOT}` (if unfilled, `ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1`).
What the editor receives and why: `$P/references/handoff-spec.md`.

## 1. Fill the brief

In `handoff.json` `brief` (it becomes `1-READ-ME-FIRST.txt`):
- `summary`: what the videos are and who they are for, in two or three sentences.
- `people`: everyone on screen, fictional names with roles. `glossary`: words the editor may not know.
- `edit_notes`: zooms for phones, pacing, style reference (`style_reference`).
- `fixes`: things to crop or blur (test-mode banners, sandbox names, stray rows).
- `do_not_say`: claims the footage does not prove, or the client forbids.
- `claims`: every claim the voiceover makes, each one visible in the footage.
- `reference_files`: the review reel and any style references to include.
- `brand`: spelling, colours, font, logo, taglines (becomes `assets/brand/BRAND.txt`).

If a client brief exists, copy its wording into these fields exactly.

## 2. Build

```bash
node "$P/scripts/title-cards.mjs" handoff.json --social    # cards and caption bands, if changed
python3 -I "$P/scripts/build-handoff.py" handoff.json      # add --no-say when not on macOS
```

It cuts both videos, writes scripts and voiceover files, the timing previews, source-footage by
part, contact sheets, READ-ME-FIRST, BRAND.txt, the social versions, and
`recordings/<slug>-editor-handoff.zip`. It must print `voiceover fits`; if not, fix the lines (demo-edit).

For a single keynote cut with no promo/how-to split, use
`python3 -I "$P/scripts/keynote-handoff.py" demo.json` instead.

## 3. Check before sending

- Open each `00_ROUGH-ASSEMBLY.mp4` and the timing previews; watch them through.
- Read 1-READ-ME-FIRST.txt as if you were the editor: could you finish without asking anything?
- Look through `reference/take-contact-sheets/` for secrets, personal data and stray test data.
- Note the zip size; source footage dominates. Drop unused parts from `parts` if it is too large.
- Open the folder for the user (`open recordings/editor-handoff`).

- **Cold follow-through** (`$P/references/quality-gates.md` section 4): follow the how-to script
  literally on a fresh test account. If you get stuck or have to guess, fix the script or re-shoot.
- Tick every entry in `brief.claims` against the footage.

## 4. When the edit comes back

Save the finished videos to `<demo>/final/`, point the demos index at them, and re-time the
voiceover to the finished cut rather than to the rough assembly.

## 5. Wrap-up checklist

- [ ] Update the demo README Status section (what was made, where, how to rebuild) and the demos
      index row if there is one.
- [ ] List the THROWAWAYS still to delete; delete them only after the user signs off.
- [ ] Remind the user to rotate any credential shared in chat or shown on screen, even blurred.
- [ ] Stop demo-only servers (frame receiver, helper servers) and close demo windows.
- [ ] Ask before deleting `recordings/frames/` (several GB). Never delete raw takes or exports
      without the go-ahead.
- [ ] Keep `app/.env` out of every zip and commit.
- [ ] Run the workspace `python3 -I check.py` if there is one; it should report nothing for this demo.
