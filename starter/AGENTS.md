# Demos: how we make a demo video

The playbook for every demo in this folder. Read it before starting or resuming a demo.
The demo-studio plugin holds the mechanics (recording rig, scene code, encoding, cuts, handoff).
This file holds your team's rules around it. Where they disagree, this file wins, so edit it to fit
how you work.

Plugin files to read (`P` is the plugin folder:
`P="${CLAUDE_PLUGIN_ROOT:-$(d=$PWD; while [ "$d" != / ] && [ ! -f "$d/.claude-plugin/plugin.json" ]; do d=$(dirname "$d"); done; [ -f "$d/.claude-plugin/plugin.json" ] && echo "$d" || ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"`):

| When | Read |
| --- | --- |
| Before planning | `$P/samples/plan/` (a filled-in plan to match) |
| Before writing a scene | `$P/samples/README.md`, then copy the nearest recipe from `$P/samples/scenes/` |
| Before the first take | `$P/references/learnings.md` and `$P/references/style-guide.md` |
| Before captions or voiceover | `$P/references/style-guide.md` sections 8 to 12 |

Run `python3 -I check.py` at the start and end of every session. It reports drift: wrong index
paths, unreviewed takes, open throwaways, leftover frames, stray secrets files, low disk.

## 1. Pick the mode first

| Mode | When | What changes |
| --- | --- | --- |
| **Our script** | We write the story | Every default below applies |
| **Client script** | Another team hands us a plan, script or voiceover | Their script is the spec. Record their shots with their exact prompts, on-screen text and naming. Plan only the logistics: accounts, seed data, checks. Raise a blocker only when a shot cannot be filmed as written. If a number differs, the footage wins. |

Write the mode at the top of the demo's README.

## 2. How much to ask

The person logs in, or hands over demo credentials, and Claude does the rest. Ask once at the
start for what is missing (URL, goal, audience, how to get in). After that, run plan, prep, test
sweep, record, QA, review reel, cuts, handoff and wrap-up without asking between stages. Write each
choice under "Decisions" in the demo's README and show everything in one report at the end. The
person can interrupt at any time.

Stop only for:

| Stop for | Example |
| --- | --- |
| A login, captcha or 2FA code | The session expired; the site sent a code |
| Something that cannot be deleted | An email to a real address, a public post, a real invoice |
| Something that costs money | A real payment, a paid plan, a paid API nobody set up |
| Deleting data Claude did not create | The person's records, raw takes, a delivered video |

Also ask before anything on a production account. When you stop, say exactly what to click or send.
Stop at review points only if the person asked for them ("check with me after the plan").

## 3. Stages and gates

The plugin's `demo-studio` skill runs the stages. A stage is finished only when its gate passes.
The full checklists are in the plugin's `references/quality-gates.md`.

| Stage | Gate |
| --- | --- |
| Access | Logged in off camera on a sandbox or test account (way A or B, section 4 Secrets); README says which way |
| Intake | Folder scaffolded, README has the mode, goal and deliverables, index row added as `Planning` |
| Plan | Shot list, cast and claims list written. Every claim has a shot that proves it |
| Prep | Seed and reset scripts work, smoke run passes end to end |
| Test sweep | Every scene, edge case and link passes, run twice from a clean state |
| Shoot | Every scene has a `keep` take. Every secret reveal checked frame by frame |
| Review | Review reel built first and checked by Claude; shown in the final report (a blocking gate only if the person asked for one) |
| Edit and handoff | Voiceover fits, claims all ticked, cold follow-through reaches the end result |
| Close out | Frames deleted, throwaways closed, status and index row set, `check.py` clean |

Update the demo README **Status** and the index row in `README.md` at the end of every stage.

## 4. House rules

**Footage**
- Raw takes at the default viewport with no page zoom. Zooms belong in the edit.
- The normal arrow cursor, moving with easing. A pointing hand only when it suits a consumer app.
- Hide personal history (recent chats, tasks, projects) before recording. Blur it, do not film it.
- Real actions through to the end result. Create things for real, then clean them up. Never fake a step.

**Prompts and typing on camera**
- Text typed on camera reads like a real user with a goal, not like a test case.

**Copy** (captions, voiceover, cards, briefs, docs)
- Plain words. One short declarative sentence per caption, sentence case, ending in a period.
- Voiceover in the second person and present tense, written for the ear. Spell out URLs and amounts.
- Claim only what the footage proves.

**Narration voice** (first match wins; the plugin's `narrate.py` picks the same way)
- The person's own recordings in the demo's `voiceover/01.wav`, `02.wav`...
- ElevenLabs, when `ELEVENLABS_API_KEY` is set in the shell. Never ask for the key in chat or write it in a file.
- macOS `say` (free). Otherwise ask the person to record their own lines.

**Secrets**
- Sandbox or test accounts only. Mask in the page while recording, never in post. One unmasked frame is a leak.
- Secrets live only in a password manager (macOS Keychain item `demo-<name>`) or, when the person
  asks for it, a demo's gitignored `app/.env`. Never in any other file here.

**Logging in** (two ways, both fine)
- Way A: the person logs in themselves in the Playwright MCP browser.
- Way B: the person hands Claude demo credentials, ideally by running
  `security add-generic-password -s demo-<name> -a '<login email>' -w` themselves in a Terminal
  window (it prompts for the password, so it never appears in chat). Claude reads it
  with `security find-generic-password -s demo-<name> -a '<login email>' -w` and logs in.
- Claude never repeats a password in chat, logs, notes, scene scripts or commits.
- Log in before recording. Never film a login form, a password field or a 2FA screen. Masking stays on.
- 2FA: Claude asks for the code at the moment the site asks for it, types it at once, and never stores it.
- Production credentials for an account with real customer data: Claude refuses, unless the person
  confirms it is a test account.
- At wrap-up, remove the Keychain item if the person wants: `security delete-generic-password -s demo-<name>`.

## 5. Folder layout

```
<name>/
  README.md          mode, goal, deliverables, cast, accounts and ids (no passwords), login way,
                     test sweep table, Decisions, Status
  BRIEF.md           the brief, verbatim if a client sent one
  RUN-SHEET.md       beat by beat, with the exact text typed on camera
  SHOT-LIST.md       scenes, captions, lengths
  VOICEOVER.md       draft lines per scene
  PREP.md            accounts, seed data, rig, smoke run
  THROWAWAYS.md      everything created; last column ends as "deleted <date>" or "kept: <reason>"
  demo.json          keynote-cut sequence
  handoff.json       promo and how-to cuts, cards, brand, brief
  app/               your copy of the product, when you run one (secrets only in app/.env)
  tools/             seed, reset, preflight, helper servers
  voiceover/         optional: your own narration, 01.wav, 02.wav... one per voiced line
  recordings/
    raw/             NN-scene-tN.mp4, one per take
    scenes/          scene scripts
    frames/          temporary; deleted at close-out
    exports/         review reel and cuts
    takes.csv        every take marked keep / alt / reject
    editor-handoff/  and <name>-editor-handoff.zip next to it
  final/             the finished videos
```

## 6. Index statuses

Use exactly one of: `Planning`, `Prepping`, `Recording`, `Review`, `With editor`, `Delivered`, `Archived`.
Then a date and a note in a few words. The "Final cut" column holds a path that exists, or `none yet`.

## 7. Notes for this workspace

Add what is specific to your team here: shared test accounts (never passwords), brand rules,
products with quirks, shell notes.
