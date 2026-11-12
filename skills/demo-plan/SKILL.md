---
name: demo-plan
description: Plan a product demo video from a goal or a client brief. Scaffolds the demo folder and writes the story arc, BRIEF, RUN-SHEET, SHOT-LIST, VOICEOVER draft, PREP checklist, THROWAWAYS and demo.json from templates. Use at the start of a demo, when a brief arrives, or when the story, scenes or voiceover need rework before recording.
---

# Demo plan

`P` is this plugin's root, `${CLAUDE_PLUGIN_ROOT}` (if unfilled, `ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1`).
Write everything down before touching the browser. A good plan makes recording mechanical.

## 1. Scaffold

```bash
DEMO_ROOT=./demos bash "$P/scripts/new-demo.sh" <name>      # lowercase-with-dashes
```

Creates `README.md, BRIEF.md, RUN-SHEET.md, SHOT-LIST.md, VOICEOVER.md, PREP.md, THROWAWAYS.md,
demo.json, handoff.json, tools/, assets/, recordings/{raw,frames,scenes,exports}/, takes.csv`.
If the demo runs our own copy of a product, clone it into `<name>/app/`. Demo-only helpers (seed,
reset, answer server) go in `<name>/tools/`. The only secrets file is `app/.env` (gitignored).
If a demos index README exists in `$DEMO_ROOT`, add a row for the new demo.

## 2. Brief (BRIEF.md)

- **A client or another team sent a brief:** paste it verbatim under "Their brief" and never change
  their wording. Their scene names, on-screen text, voiceover lines, product names and taglines are
  used exactly as written, including in demo.json and handoff.json. Our interpretation and open
  questions go under "Our reading". If the footage cannot prove one of their claims, or a line does
  not fit its time, tell the user and suggest a change; do not edit silently.
- **No brief:** write "Our reading" from the goal: goal, audience, where it runs, videos wanted,
  must-show claims, must-not-say, voiceover yes or no.

## 3. Story arc

Default arc: **why** (the pain, in context) -> **find it** -> **set it up** (install, each credential
with least-privilege scopes, where secrets go, run) -> **use it** (the hero flow end to end) ->
**proof** (the result in the system of record) -> **edge case** (it asks instead of guessing, cancel,
an error handled) -> **close** (the one-line payoff and where to get it).

- One consistent world: one workspace, one customer, one set of numbers across every scene.
- Fictional people with names and roles ("Riley Chen, sales"). Never real customers.
- The promo (about 1:30) tells the story; the how-to (about 3:00) adds setup steps and the edge case.
  Plan scenes so both videos come from one shoot.

## 4. RUN-SHEET.md

Beat by beat: where, the pointer action, the exact text typed on camera, the expected result and its
latency, and a draft voiceover line. This is what you follow while recording.

## 5. SHOT-LIST.md

One row per scene: number, part, scene stem, what is on screen, caption, target length, and what it
depends on (scenes that show the same seeded data or the same record). Stems are `NN-kebab-name`
(`03-add-key`); use `03b` for inserts. Keep scenes short (10 to 40s) and single purpose.

## 6. VOICEOVER.md

Draft the lines now, per scene, for the promo and the how-to. Rules (full guide in
`$P/references/voiceover.md`):
- Spoken English, present tense, second person. Point at what is on screen and say why.
- About **2.5 words per second** of the scene's time.
- **No em dashes**, parentheses or symbols. Spell out URLs ("acme dot com slash billing") and
  amounts ("twelve hundred dollars").
- Claim only what the footage will show.

## 7. PREP.md

Fill the checklist: accounts (sandbox or test only), a dedicated demo user with realistic seeded
data, seed and reset scripts in `tools/`, consistent numbers, timezone and locale for time-sensitive
UI, clutter list, secret patterns, one instance of every service, and the smoke run. Recording starts
only when PREP is ticked.

## 8. demo.json and _project.js

- `demo.json` `sequence`: the scenes plus title cards between parts. Add `browser.timezone` and, for
  multi-person demos, `windows` (see `$P/schemas/demo.schema.json`).
- `recordings/scenes/_project.js`: `cursor` ('arrow' by default, or 'hand'), `maskPatterns` and `maskLabels` for the
  product's secrets, `clutter` for banners and toasts.
- `handoff.json` is filled after recording (in and out points come from the takes); see demo-edit.

## 9. Claims and test sweep

Before recording, pass the first two gates in `$P/references/quality-gates.md`: every claim the
script makes maps to a scene that proves it, and the test sweep (each scene and edge case run off
camera from a clean state, the hero flow twice, the dead-end hunt) is written as a table in the
demo README with every row passing.

## 10. Show the user

Post the scene table and a three-line story summary. Continue unless they object.
See `$P/examples/acme-invoice-bot/` for a filled-in plan.
