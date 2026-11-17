---
name: demo-studio
description: Make a product demo video end to end. Turns a goal or a client brief into a plan (story arc, run sheet, shot list, voiceover draft, prep checklist), records crisp 1080p browser takes with Playwright MCP and masked secrets, builds a review reel, a keynote-style cut with free narration, a promo cut and a how-to cut, optional 4:5 and 9:16 social versions, and an editor handoff zip. Use when someone asks to "make a demo of X", record or film a product walkthrough, produce demo footage, hand demo videos to an editor, or just wants to try demo-studio.
---

# Demo studio

The orchestrator. Follow the steps in order. Each stage has its own skill with the exact commands;
this file says which one to open and when a stage is done.

## Step 0: find the plugin folder (do this first, every session)

Every command uses `$P`, the plugin's root. Set it once in each shell command you run:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"; echo "$P"
```

Expected: a path ending in `/demo-studio/<version>/`. If it prints nothing, the plugin is not
installed: tell the user to run `/plugin install demo-studio@demo-studio`.

Shell state does not carry between commands, so start each command with that `P=...` line.

## Step 1: health check

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
bash "$P/scripts/doctor.sh"
```

Expected last line: `All required checks passed.`

| If you see | Do this |
| --- | --- |
| `FAIL ... fix: <command>` | Show the user that exact fix command. Stop until they run it, then run doctor.sh again |
| `FAIL playwright-core not installed` | Run `npm install --prefix "$P"` yourself, then doctor.sh again |
| `warn` lines only | Fine. They are optional extras (Cardboard, drawtext, say, ElevenLabs) |

## Step 2: pick the route

| The user said | Route |
| --- | --- |
| "try it", "show me", "test the plugin", no product named | **Try-it route** below (todo sample, no login) |
| "make a demo of X" with a goal | **Full route**, Step 3 onwards |
| "record scene NN again" or "re-shoot" | Open skill `demo-record`, section "Re-shoot" |
| "cut it", "add voiceover", "make a vertical version" | Open skill `demo-edit` |
| "send it to the editor", "wrap up" | Open skill `demo-handoff` |
| "where are my demos", "what state is X in" | The home screen, Step 9 |

## Try-it route: the todo sample (about 10 minutes, no login)

Records and cuts `$P/examples/todo-sample` (a public todo app) so the user sees the whole pipeline.

1. Copy it into the demos folder, then clear its take log and the shipped takes:
   ```bash
   P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
   mkdir -p demos && command cp -R "$P/examples/todo-sample" demos/todo-sample
   cd demos/todo-sample/recordings && mkdir -p raw frames exports && head -1 takes.csv > t && command mv t takes.csv
   command rm -f raw/*.mp4   # the example ships its takes; record fresh ones
   ```
2. Follow skill `demo-record` from its Step 1 with the URL `https://todomvc.com/examples/react/dist/`
   and the scenes `01-add-todos`, `02-complete-and-filter`, `03-clear-completed`, in that order.
   The scene bodies already exist in `recordings/scenes/`.
3. Follow skill `demo-edit` Steps 1, 2 and 3 (review reel, keynote cut, narration).
4. Open `recordings/exports/todo-app-sample-keynote-cut-narrated.mp4` for the user.

Done when: the narrated cut plays and the user has seen it.

## Full route

### Step 3: ask once

Ask only what you cannot find out yourself, in **one message**:

- which accounts to use (sandbox or test only), and whether they are logged in in the Playwright
  MCP browser (or which windows to open for a two-person demo)
- the brief, if someone sent one, and who the audience is
- which videos they want (default: keynote cut with narration; promo and how-to if an editor is involved)
- whether things created on camera may be created for real and deleted afterwards (default yes)

Never ask about resolution, pacing, cursor, zoom or style. `$P/references/style-guide.md` is the answer.
If the folder has an `AGENTS.md` (the starter kit's playbook), read it first. It wins over this file.

### Step 4: plan (skill `demo-plan`)

Done when: BRIEF.md, SHOT-LIST.md, RUN-SHEET.md, VOICEOVER.md, PREP.md and demo.json are filled,
the claims list maps every claim to a scene, and the user has seen the scene table.

### Step 5: prep and test sweep (skill `demo-plan`, steps 7 and 9)

Done when: every box in PREP.md is ticked and the test sweep table in the demo's README.md has
`pass` on every row.

### Step 6: record (skill `demo-record`)

Done when: every scene in SHOT-LIST.md has exactly one `keep` row in `recordings/takes.csv`, no row
is still `new`, and THROWAWAYS.md lists everything created on camera.

### Step 7: review and edit (skill `demo-edit`)

Done when: the user has seen `recordings/exports/review-reel.mp4`, and the cuts they asked for
exist in `recordings/exports/`. **Stop here if the user asked only for raw footage.**

### Step 8: handoff and wrap-up (skill `demo-handoff`)

Done when: the wrap-up checklist in demo-handoff is fully ticked.

## Step 9: the home screen (any time)

Offer it when someone starts out, comes back, or asks what state the demos are in:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
npm --prefix "$P" run studio        # run_in_background: true; opens http://127.0.0.1:4317
```

It only reads files. Stop it when the session ends. If it fails with a missing module, run
`npm install --prefix "$P"` first.

## Defaults (never ask about these)

| Thing | Default |
| --- | --- |
| Viewport | 1440x810 CSS, DPR 2 (2880x1620 capture) |
| Raw takes | 1920x1080, 30fps constant, H.264 CRF 14 `-preset slow`, lanczos, silent |
| Take handles | 1 to 1.5s still at start, 2 to 3s hold at end |
| Pointer | normal arrow; `PROJECT.cursor = 'hand'` only for a consumer app |
| Pointer motion | eased glides on a slight arc, 300 to 600ms pause before clicks, park after |
| Typing | 45 to 75ms per key; paste anything longer than about 2 lines |
| Zoom | none except the 1.05 push-in; 1.5 to 1.75x on the hero moment only |
| Captions | one short declarative sentence per scene, sentence case, period, no em dashes |
| Voiceover | spoken English, about 2.5 words per second, URLs and amounts spelled out |
| Narration voice | own recordings in `voiceover/`, else ElevenLabs if `ELEVENLABS_API_KEY` is set, else macOS `say` |
| Music | none unless asked; then `voice.music` at 0.12 to 0.18, ducked |
| Videos | keynote cut + narration; promo about 1:30 and how-to about 3:00 for an editor |
| Social | 4:5 1080x1350 and 9:16 1080x1920, blurred footage background, caption band |
| Demo folder | `$DEMO_ROOT/<name>`, default `./demos/<name>` |
| Accounts | sandbox or test only, a dedicated seeded demo user |
| Footage | real screen recordings only, no AI-generated clips or imagery |
| Finishing | free path (`build-keynote.py`, `narrate.py`); Cardboard only if the user asks |

## Where things are

| What | Path |
| --- | --- |
| Stage skills | `demo-plan`, `demo-record`, `demo-edit`, `demo-handoff`; `demo-cardboard` (optional) |
| The house look | `$P/references/style-guide.md` |
| Scene recipes and a sample plan | `$P/samples/README.md` |
| Gotchas from real shoots | `$P/references/learnings.md` |
| Gates between stages | `$P/references/quality-gates.md` |
| More scene code | `$P/references/scene-patterns.md` |
| Voiceover rules | `$P/references/voiceover.md` |
| Secrets | `$P/references/secrets.md` |
| Editor handoff contents | `$P/references/handoff-spec.md` |
| Cardboard (optional) | `$P/references/cardboard.md` |
| Templates new-demo.sh copies | `$P/templates/` |
| Config shapes | `$P/schemas/demo.schema.json`, `$P/schemas/handoff.schema.json` |
| Examples | `$P/examples/todo-sample/` (recorded), `$P/examples/acme-invoice-bot/` (plan) |
| Workspace starter kit | `$P/starter/`, installed by `bash "$P/scripts/new-workspace.sh" ./demos` |

## House rules

- Sandbox or test accounts only. Never show a real secret or real customer data.
- Create things on camera for real, list them in THROWAWAYS.md, delete after sign-off.
- Run one instance of any bot or server at a time.
- Copy (captions, voiceover, docs) is plain spoken English with no em dashes.
- Never delete recordings, frames or throwaways without the user's go-ahead.
- Never write secrets into any file in the demo folder except a gitignored `app/.env`. Never ask the
  user to paste an API key into chat.
