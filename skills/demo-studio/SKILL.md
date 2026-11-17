---
name: demo-studio
description: Make a product demo video end to end, hands off. The user logs in or hands over demo credentials once, then it runs without further questions. Turns a goal or a client brief into a plan (story arc, run sheet, shot list, voiceover draft, prep checklist), records crisp 1080p browser takes with Playwright MCP and masked secrets, builds a review reel, a keynote-style cut with free narration, a promo cut and a how-to cut, optional 4:5 and 9:16 social versions, and an editor handoff zip. Use when someone asks to "make a demo of X", record or film a product walkthrough, produce demo footage, hand demo videos to an editor, or just wants to try demo-studio.
---

# Demo studio

The orchestrator. Follow the steps in order. Each stage has its own skill with the exact commands;
this file says which one to open and when a stage is done.

## Step 0: find the plugin folder (do this first, every session)

Every command uses `$P`, the plugin's root. Set it once in each shell command you run:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(d=$PWD; while [ "$d" != / ] && [ ! -f "$d/.claude-plugin/plugin.json" ]; do d=$(dirname "$d"); done; [ -f "$d/.claude-plugin/plugin.json" ] && echo "$d" || ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"; echo "$P"
```

Expected: a path ending in `/demo-studio/<version>/`. If it prints nothing, the plugin is not
installed: tell the user to run `/plugin install demo-studio@demo-studio`.

Shell state does not carry between commands, so start each command with that `P=...` line.

## Step 1: health check

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(d=$PWD; while [ "$d" != / ] && [ ! -f "$d/.claude-plugin/plugin.json" ]; do d=$(dirname "$d"); done; [ -f "$d/.claude-plugin/plugin.json" ] && echo "$d" || ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
bash "$P/scripts/doctor.sh"
```

Expected last line: `All required checks passed.`

| If you see | Do this |
| --- | --- |
| `FAIL ... fix: <command>` | Show the user that exact fix command. Stop until they run it, then run doctor.sh again |
| `FAIL playwright-core not installed` | Run `npm install --prefix "$P"` yourself, then doctor.sh again |
| `warn` lines only | Fine. They are optional extras (drawtext, say, ElevenLabs) |

## Step 2: pick the route

| The user said | Route |
| --- | --- |
| "try it", "show me", "test the plugin", no product named | **Try-it route** below (todo sample, no login) |
| "make a demo of X" with a goal | **Full route**, Step 3 onwards |
| "record scene NN again" or "re-shoot" | Open skill `demo-record`, section "Re-shoot" |
| "cut it", "add voiceover", "make a vertical version" | Open skill `demo-edit` |
| "send it to the editor", "wrap up" | Open skill `demo-handoff` |
| "where are my demos", "what state is X in" | The home screen, Step 9 |
| "organise my demos", "clean up", "tidy the folder" | Open skill `demo-organize` |

## Try-it route: the todo sample (about 10 minutes, no login)

Records and cuts `$P/examples/todo-sample` (a public todo app) so the user sees the whole pipeline.

1. Copy it into the demos folder, then clear its take log and the shipped takes:
   ```bash
   P="${CLAUDE_PLUGIN_ROOT:-$(d=$PWD; while [ "$d" != / ] && [ ! -f "$d/.claude-plugin/plugin.json" ]; do d=$(dirname "$d"); done; [ -f "$d/.claude-plugin/plugin.json" ] && echo "$d" || ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
   mkdir -p demos && command cp -R "$P/examples/todo-sample" demos/todo-sample
   cd demos/todo-sample/recordings && mkdir -p raw frames exports && head -1 takes.csv > t && command mv t takes.csv
   command rm -f raw/*.mp4   # the example ships its takes; record fresh ones
   ```
2. Follow skill `demo-record` from its Step 1 with the URL `https://todomvc.com/examples/react/dist/`
   and the scenes `01-add-todos`, `02-complete-and-filter`, `03-clear-completed`, in that order.
   The scene bodies already exist in `recordings/scenes/`.
3. Follow skill `demo-edit` Steps 1, 2, 3 and 2b (review reel, keynote cut, narration with
   `python3 -I "$P/scripts/make-bed.py" music/bed.m4a --seconds 40` for the bed, then the
   quality-bar checklist). The sample's demo.json already plans the crop, zooms, highlights, pills
   and cards; after recording, update its rects from `recordings/scout/`.
4. Open `recordings/exports/todo-app-sample-keynote-cut-narrated.mp4` for the user.

Done when: `check-cut.py` reports 0 FAIL on the narrated cut and the user has seen it.

## Full route

The promise to the user: **they log in, or hand over demo credentials, and you do the rest.**
After Stage 0 you run every stage to the end without asking anything, then show the results.

If the folder has an `AGENTS.md` (the starter kit's playbook), read it first. It wins over this file.

### Step 3 (Stage 0): access and the one intake message

**3a. Ask once, only for what is missing.** If the user's first message already has it, skip it.
Send one message with only the missing items:

- the product URL and the goal (what the viewer should see happen)
- the brief, if someone sent one, and who the audience is (default: people who might buy it)
- how you get in: "Log in yourself in the Playwright browser" (way A) or "give me demo
  credentials" (way B). Say that sandbox or test accounts only are used.

Never ask about resolution, pacing, cursor, zoom, style, which videos or whether to create test
data. The defaults below and `$P/references/style-guide.md` answer those. Default videos: review
reel, keynote cut, narrated cut. Add promo, how-to and the editor zip if an editor is mentioned.

**3b. Check the account is safe to film.**

| What you see | Do this |
| --- | --- |
| Host or account says sandbox, test, demo, staging or dev, or the user said it is a test account | Go on |
| A production app, and you cannot tell whether the account holds real customer data | Ask once: "Is this a test account with no real customer data? I only film test accounts." Go on only after a clear yes |
| The user says it is a real account with real customers | Do not log in. Ask for a sandbox or test account instead |

**3c. Way A: the user logs in themselves.**

1. Call the Playwright MCP tool `browser_navigate` with the product's login URL.
2. Tell the user: "Please log in to <url> in the Chrome window the Playwright MCP just opened (not
   your everyday Chrome). Say done when you see the app."
3. When they say done, call `browser_snapshot`. If it still shows a login form, ask again once.
4. Go to 3e.

**3d. Way B: the user hands you demo credentials.** You log in; nothing is written to a file.

1. Best: the user stores the password in macOS Keychain themselves, so it never appears in chat.
   Give them this line to run in their own Terminal window (`-w` last makes it prompt for the
   password without echoing it), and wait for "done":
   ```bash
   security add-generic-password -s demo-<name> -a '<login email>' -w
   ```
   If they already pasted the password in chat, store it for re-logins yourself and tell them you
   did (macOS only; elsewhere keep it only in this conversation):
   ```bash
   security add-generic-password -U -s demo-<name> -a '<login email>' -w '<password>'
   ```
2. Log in now, off camera. Follow skill `demo-record`, Step 0 (it reads the Keychain item, fills
   the form and handles 2FA).
3. Never repeat the password in a message, a file, a scene script, `takes.csv`, a commit or a log
   line. Refer to it as "the password in Keychain item demo-<name>".
4. Write the password to a file only if the user explicitly asks for one, and then only to
   `<demo>/app/.env`, after checking it is ignored:
   `git -C <demo> check-ignore -q app/.env && echo ignored` (expected `ignored`, or no git repo).
5. 2FA: when the site asks for a code, ask the user for it at that moment ("The site wants a 2FA
   code. Please send me the code from your authenticator."). Type it straight away. Never store it.

**3e. Done when:** `browser_snapshot` shows the logged-in app, not a login page, and the demo's
README.md says which way was used and the login email (never the password).

### Steps 4 to 8: run every stage without stopping

**Do not ask between stages. Show results at the end. The user can interrupt at any time.**
Make the sensible choice yourself, write it down in the demo's README.md under "Decisions", and
keep going. Do not wait for a reply after posting a progress note.

Stop and ask **only** in these cases:

| Situation | What to say |
| --- | --- |
| A login, captcha or 2FA code is needed, or the session expired and no Keychain item exists | Exactly what to click or which code to send |
| A step would create something that cannot be deleted (an email to a real address, a public post, a real invoice, a published page) | What it creates and where; offer a deletable alternative |
| A step costs money (a real payment, a paid plan, a paid API you have not been told to use) | What it costs and why it is needed |
| A step deletes data you did not create (records not in THROWAWAYS.md, the user's files, raw takes, finished videos) | What would be deleted |

Everything else is your call: fix a broken scene, re-shoot, re-seed, trim, re-time, cut a claim
that the footage cannot prove. If the user asked for review gates ("check with me after the plan",
"show me the reel before you edit"), stop at exactly those points and nowhere else.

| Step | Stage | Skill | Done when |
| --- | --- | --- | --- |
| 4 | Plan | `demo-plan` Steps 1 to 8 | BRIEF, SHOT-LIST, RUN-SHEET, VOICEOVER, PREP and demo.json filled; every claim maps to a scene |
| 5 | Prep and test sweep | `demo-plan` Steps 7 and 9 | Every PREP.md box ticked; the test sweep table in README.md has `pass` on every row |
| 6 | Record and QA | `demo-record` | One `keep` row per scene in `recordings/takes.csv`, none `new`; THROWAWAYS.md lists everything created |
| 7 | Review reel and cuts | `demo-edit` Steps 1 to 3 and 2b (4 and 5 if asked) | `review-reel.mp4` and every cut asked for exist in `recordings/exports/`, and `check-cut.py` reports **0 FAIL** on the narrated keynote cut with every LOOK frame read. **Stop here if the user asked only for raw footage** |
| 8 | Handoff and wrap-up | `demo-handoff` | Its wrap-up checklist is ticked, except boxes that need the user's go-ahead |

Build the review reel first and check it yourself on a contact sheet. Do not wait for the user to
watch it; it goes in the final report.

### The quality bar gate (before any video is called finished)

A video is **not finished** until `python3 -I "$P/scripts/check-cut.py" <cut> --frames <dir>`
reports 0 FAIL and you have read every frame it saved (skill `demo-edit` Step 2b). Until then, say
"draft" in every message about it, never "done" or "finished". If an item cannot pass (for example
the take was recorded with another cursor), name the item, the measured value and the bar in the
final report, and offer the fix (usually a re-shoot). The bar is `$P/docs/quality-bar.md`.

### Step 8b: the final report (one message)

1. Open the main video for the user: `open <demo>/recordings/exports/*-keynote-cut-narrated.mp4`
   (if there is no narrated cut, the `*-keynote-cut.mp4`).
2. Post:
   - the path of every video made, review reel first
   - the scene table with one line per scene
   - the decisions you made on your own (from README.md "Decisions")
   - the checklist summary line from `check-cut.py` (`N pass, 0 fail, M to look at`) and any item
     accepted below the bar, with its measured value
   - anything that failed or was cut, and why
   - what is still open, with the exact words to say: "Say clean up and I will delete the N
     throwaways in THROWAWAYS.md and the frames in `recordings/frames/` (about X GB)."
   - if you used way B: "Your demo password is in Keychain as demo-<name>. To remove it:
     `security delete-generic-password -s demo-<name>`."

## Step 9: the home screen (any time)

Offer it when someone starts out, comes back, or asks what state the demos are in:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(d=$PWD; while [ "$d" != / ] && [ ! -f "$d/.claude-plugin/plugin.json" ]; do d=$(dirname "$d"); done; [ -f "$d/.claude-plugin/plugin.json" ] && echo "$d" || ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
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
| Pointer | `PROJECT.cursor = 'hand'`: a pointing hand (`'arrow'` for developer tools); never a dot |
| Pointer motion | eased glides on a slight arc, 300 to 600ms pause before clicks, park after |
| Typing | 45 to 75ms per key; paste anything longer than about 2 lines |
| Look of the cut | `$P/docs/quality-bar.md`: pastel background, 1560x800 window cropped to the UI, rise-in, Inter titles with one accent word |
| Zoom | whole window to 1.15x, 1.1 s ease, about one per 11 s, only where the narration makes a point |
| Callouts | pills under the window, 3 to 5 s: person (name, role) or a statement of 6 words at most |
| Highlights | red outline on the one element the narration names, 0.17 s after a zoom lands |
| Voiceover | spoken English, about 2.5 words per second, URLs and amounts spelled out |
| Narration voice | own recordings in `voiceover/`, else ElevenLabs if `ELEVENLABS_API_KEY` is set, else macOS `say` |
| Music | always a bed (`make-bed.py` when nothing else), 13 dB under the voice, ducked, one dip; mix at -14 LUFS, true peak under -1 dBTP |
| Videos | keynote cut + narration; promo about 1:30 and how-to about 3:00 for an editor |
| Social | 4:5 1080x1350 and 9:16 1080x1920, blurred footage background, caption band |
| Demo folder | `$DEMO_ROOT/<name>`, default `./demos/<name>` |
| Accounts | sandbox or test only, a dedicated seeded demo user |
| Login | way A (user logs in) unless they hand over credentials; always before recording, never on camera |
| Questions | none after Stage 0, except the four stop cases in Steps 4 to 8 |
| Review reel | shown in the final report, not a gate, unless the user asked for review gates |
| Things created on camera | created for real, listed in THROWAWAYS.md, deleted when the user says clean up |
| Footage | real screen recordings only, no AI-generated clips or imagery |
| Finishing | free path (`build-keynote.py`, `narrate.py`), then `check-cut.py` until 0 FAIL |

## Where things are

| What | Path |
| --- | --- |
| Stage skills | `demo-plan`, `demo-record`, `demo-edit`, `demo-handoff`; housekeeping: `demo-organize` |
| The house look | `$P/references/style-guide.md` |
| Scene recipes and a sample plan | `$P/samples/README.md` |
| Gotchas from real shoots | `$P/references/learnings.md` |
| Gates between stages | `$P/references/quality-gates.md` |
| The bar every finished cut must pass | `$P/docs/quality-bar.md` (checklist in section 4, run by `scripts/check-cut.py`) |
| More scene code | `$P/references/scene-patterns.md` |
| Voiceover rules | `$P/references/voiceover.md` |
| Secrets | `$P/references/secrets.md` |
| Editor handoff contents | `$P/references/handoff-spec.md` |
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
- Never write secrets into any file in the demo folder except a gitignored `app/.env`, and that only
  when the user asks for it. Prefer macOS Keychain (`demo-<name>`). Never ask the user to paste an
  API key into chat, and never repeat a password they gave you.
- Log in before recording. A login form must never be on camera, and in-page masking stays on.
