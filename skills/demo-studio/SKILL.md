---
name: demo-studio
description: Make a product demo video end to end. Turns a goal or a client brief into a plan (story arc, run sheet, shot list, voiceover draft, prep checklist), records crisp 1080p browser takes with Playwright MCP and masked secrets, builds a review reel, a promo cut and a how-to cut with voiceover scripts, optional 4:5 and 9:16 social versions, and an editor handoff zip. Use when someone asks to "make a demo of X", record or film a product walkthrough, produce demo footage, or hand demo videos to an editor.
---

# Demo studio

The orchestrator. It runs the whole pipeline stage by stage and hands each stage to its own skill:

```
brief -> plan -> prep -> record -> QA -> review reel -> edit (keynote / promo + how-to) -> handoff -> social -> wrap-up
         demo-plan  demo-plan  demo-record          demo-edit                  demo-handoff  demo-edit  demo-handoff
```

`P` below means this plugin's root, `${CLAUDE_PLUGIN_ROOT}`. Every tool lives in `$P/scripts/`.
If that placeholder was not filled in (the path does not exist), find the root with
`ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1` and use that.

Read `$P/references/learnings.md` before the first take. It is short, and every line cost a re-shoot.
`$P/references/quality-gates.md` lists the gate between each pair of stages; a stage is done only
when its gate passes.

If the folder that holds the demos has an `AGENTS.md` (the starter kit's playbook), read it first.
It holds the team's own rules, and where it disagrees with this skill, it wins. No workspace yet?
Offer `bash "$P/scripts/new-workspace.sh" ./demos`, which adds the playbook, a demos index and
`check.py`, a drift report to run at the start and end of every session.

## Stage 0: health check and goal

1. Run `bash "$P/scripts/doctor.sh"`. If anything required fails, show the user the fix commands
   and stop until it passes. The Playwright MCP browser is the one that gets recorded; it must be
   set up (see the README) and logged in to the right accounts.
2. Read the goal. If it names a repo or product, read its README, setup docs and manifest so you
   know the real steps and the real UI. If a client or another team sent a brief, keep their
   wording exactly (see demo-plan).
3. Ask the user only what you cannot find out yourself, in **one message**:
   - which accounts to use (sandbox or test only), and whether they are logged in in the Playwright
     MCP browser (or which demo windows to open for multi-person demos)
   - the brief, if there is one, and who the audience is
   - which videos they want (defaults below) and whether they want voiceover
   - scenes to add or skip, and whether items created on camera may be created for real and deleted
     afterwards (default yes)
   Do not ask about resolution, pacing, cursor or style. The defaults are the answer.

## Stage 1: plan (skill demo-plan)

Scaffold with `DEMO_ROOT=<where demos live> bash "$P/scripts/new-demo.sh" <name>` (default
`./demos/<name>`). Fill BRIEF, RUN-SHEET, SHOT-LIST, VOICEOVER, PREP and demo.json from the goal.
Show the user the scene table and the story in a few lines, and continue unless they object.

## Stage 2: prep (skill demo-plan, PREP.md)

Accounts, a dedicated demo user, seed data, reset scripts, timezone, clutter and secret patterns,
one instance of every service, then a full smoke run off camera. Do not film until PREP.md is ticked.

Then the **test sweep** (quality-gates.md section 2): run every scene and edge case off camera from
a clean state, run the hero flow twice, and hunt dead ends (links, commands, setup steps a viewer
could not repeat). Write the result table in the demo README. Fix failures or cut the scene.

## Stage 3: record and QA (skill demo-record)

One scene per run: write the body, wrap it, run it, QA the frames, encode, log the take, list
throwaways. Keep the "use" scenes in one continuous pass so ids and numbers match.

## Stage 4: review (skill demo-edit)

Mark keepers in `takes.csv`, then `python3 -I "$P/scripts/review-reel.py" recordings --config demo.json`
and show the user the reel (`open recordings/exports/review-reel.mp4`) before any polish.
**Stop here if the user asked only for raw footage.**

## Stage 5: edit (skill demo-edit)

- Keynote-style cut from demo.json (optional): floating window, captions, cards, eased zooms.
- Promo and how-to from handoff.json: in/out points per shot, title cards, voiceover per scene,
  fit check, timing preview.

Two ways to finish, chosen by what is installed and what the user asks for:

| Path | Needs | Gives |
| --- | --- | --- |
| Built in (default) | ffmpeg only | Rough assemblies, scripts and a zip for a human editor |
| Cardboard (optional) | the Cardboard app and its `cb` CLI | A finished video: narration, captions, music, export (skill demo-cardboard) |

Both start from the same `handoff.json`. Never require Cardboard; if `cb` is missing, use the built-in path.

## Stage 6: handoff and social (skills demo-handoff, demo-edit)

`python3 -I "$P/scripts/build-handoff.py" handoff.json` builds the folder, the social versions and
the zip. Check that it printed `voiceover fits`, then open the rough assemblies for the user.

## Stage 7: wrap-up (skill demo-handoff)

Update the demo README status, list THROWAWAYS to delete after sign-off, remind about key rotation,
and ask before deleting `recordings/frames/`.

## Defaults (do not ask)

| Thing | Default |
| --- | --- |
| Viewport | 1440x810 CSS, DPR 2 (2880x1620 capture) |
| Raw takes | 1920x1080, 30fps constant, H.264 CRF 14 `-preset slow`, lanczos, silent |
| Take handles | 1 to 1.5s still at start, 2 to 3s hold at end |
| Pointer | the normal arrow cursor; `PROJECT.cursor = 'hand'` when a pointing hand suits a consumer app |
| Pointer motion | eased glides on a slight arc, pauses 300 to 600ms before clicks, parks after |
| Typing | 45 to 75ms per key; paste anything longer than about 2 lines |
| Videos | promo about 1:30 and how-to about 3:00 from one shoot |
| Captions | one short declarative sentence per scene, sentence case, period, no em dashes |
| Voiceover | spoken English, about 2.5 words per second, URLs and amounts spelled out |
| Keynote look | light background, 1600x900 rounded window, soft shadow, SF Pro, 0.4s fades |
| Social | 4:5 1080x1350 and 9:16 1080x1920, blurred footage background, caption band |
| Demo folder | `$DEMO_ROOT/<name>`, default `./demos/<name>` |
| Accounts | sandbox or test only, a dedicated seeded demo user |
| Footage | real screen recordings only, no AI-generated clips or imagery |

## Where things are

- Stage skills: `demo-plan`, `demo-record`, `demo-edit`, `demo-handoff`, `demo-cardboard` (optional)
- Starter kit: `$P/starter/` (installed by new-workspace.sh)
- References: `$P/references/quality-gates.md`, `cardboard.md`, `learnings.md`, `scene-patterns.md`, `voiceover.md`, `handoff-spec.md`, `secrets.md`
- Templates: `$P/templates/` (copied by new-demo.sh)
- Config shapes: `$P/schemas/demo.schema.json`, `$P/schemas/handoff.schema.json`
- Worked example: `$P/examples/acme-invoice-bot/`

## House rules

- Sandbox or test accounts only. Never show a real secret or real customer data.
- Create things on camera for real, list them in THROWAWAYS.md, delete after sign-off.
- Run one instance of any bot or server at a time.
- Copy (captions, voiceover, docs) is plain spoken English with no em dashes.
- Never delete recordings, frames or throwaways without the user's go-ahead.
- Never write secrets into any file in the demo folder except a gitignored `app/.env`.
