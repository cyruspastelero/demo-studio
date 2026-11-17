---
name: demo-plan
description: Plan a product demo video from a goal or a client brief. Scaffolds the demo folder and writes the story arc, BRIEF, RUN-SHEET, SHOT-LIST, VOICEOVER draft, PREP checklist, THROWAWAYS and demo.json from templates, then runs the prep and test sweep. Use at the start of a demo, when a brief arrives, or when the story, scenes or voiceover need rework before recording.
---

# Demo plan

Write everything down before touching the browser. A good plan makes recording mechanical.

Do not ask the user anything here. Make each choice yourself and note it in the demo's README.md
under "Decisions". The only stops are the ones in skill `demo-studio` (a login or 2FA code;
something that cannot be deleted; something that costs money; deleting data you did not create).

Start every shell command with this line (it finds the plugin folder):

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(d=$PWD; while [ "$d" != / ] && [ ! -f "$d/.claude-plugin/plugin.json" ]; do d=$(dirname "$d"); done; [ -f "$d/.claude-plugin/plugin.json" ] && echo "$d" || ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
```

**Before you write anything, open the sample plan** at `$P/samples/plan/` (BRIEF.md, SHOT-LIST.md,
RUN-SHEET.md, VOICEOVER.md, demo.json). Match its level of detail. The look and copy rules are in
`$P/references/style-guide.md`. The finished cut must pass `$P/docs/quality-bar.md`; this plan is
where its callouts, highlights, zooms, crops, title accents, voice and music are decided.

## Step 1: scaffold

```bash
DEMO_ROOT=./demos bash "$P/scripts/new-demo.sh" <name>      # <name> is lowercase-with-dashes
```

Expected: `scaffolded ./demos/<name>` and `OUTPUT ./demos/<name>`.

| If you see | Do this |
| --- | --- |
| `already exists` | Read its README.md. Same goal: resume it from its Status. Different goal: use `<name>-2` and say so in the final report. Do not ask |
| `usage` or a name error | Use only lowercase letters, digits and dashes |

It creates `README.md, BRIEF.md, RUN-SHEET.md, SHOT-LIST.md, VOICEOVER.md, PREP.md, THROWAWAYS.md,
demo.json, handoff.json, tools/, assets/, recordings/{raw,frames,scenes,exports}/, recordings/takes.csv`.
If `./demos/README.md` (the index) exists, add a row: `| <name> | <one line> | Planning <date> | none yet |`.

## Step 2: BRIEF.md

| Situation | What to write |
| --- | --- |
| Someone sent a brief | Paste it word for word under "Their brief". Never change their wording, in any file. Our notes go under "Our reading" |
| No brief | Write "none: internal demo" under "Their brief", then fill every line of "Our reading" from the goal |

Then add a **Claims list** table (claim, proved by scene), as in `$P/samples/plan/BRIEF.md`.
A claim with no scene that proves it is cut from the script.

## Step 3: story arc

Use this order unless the brief says otherwise:

**why** (the pain) -> **set it up** (install, each credential with least privilege) -> **use it**
(the hero flow) -> **proof** (the result in the system of record) -> **edge case** (it handles an
error or asks instead of guessing) -> **close** (the payoff and where to get it).

- One world: one workspace, one customer, one set of numbers across every scene.
- Fictional people with a name and role ("Riley Chen, growth lead"). Never real customers.

## Step 4: SHOT-LIST.md

One row per scene: number, part, stem, what is on screen, caption, length, depends on, recipe.

- Stems are `NN-kebab-name` (`03-add-key`); `03b` for an insert.
- Each scene is 10 to 40 seconds and does one thing.
- "Depends on" names the scenes that show the same data, so a re-seed re-shoots all of them.
- "Recipe" names the file in `$P/samples/scenes/` the scene body will start from:

| The scene shows | Recipe |
| --- | --- |
| A form, with an error then success | `form-validation.body.js` |
| A long page or dashboard | `dashboard-tour.body.js` |
| Creating an API key or token | `secret-reveal.body.js` |
| An AI or bot reply | `ai-chat-reply.body.js` |
| A dialog (invite, share, confirm) | `modal-dialog.body.js` |
| A setting with a visible effect | `settings-toggle.body.js` |
| Finding a record in a list | `table-search-filter.body.js` |
| Two people in two windows | `two-person-handoff-a.body.js` and `-b` |
| None of these | the skeleton in `$P/references/scene-patterns.md` |

Captions: one short sentence, sentence case, ending in a period, under about eight words.

Then fill the **Edit plan** table under the scenes (copy its shape from the sample). For every
scene decide, in this order:

| Column | Rule (quality bar id) | Example |
| --- | --- | --- |
| Window region (becomes `crop`) | The part of the UI the scene is about; no empty sidebars; body text must end up >= 18 px cap height (W2) | "Assistant panel and its reply" |
| Callout pill | 3 to 5 s, one at a time, never during a zoom (C8, Z7). `person` for "who": name + role + photo. `statement` for the point: at most 6 words, sentence case (C4) | person: Riley Chen, growth lead |
| Zoom target | When (the moment the voiceover makes the point) and what. About one per 11 s of footage, held 2.4 to 4.5 s (Z5, Z6) | "As the reply lands: the 471 figure" |
| Highlight | The one element the narration names, as a selector the record step can measure (`getByRole`, `data-testid`, text). At most 2 on screen (H7) | `[data-testid=answer-figure]` |
| Music | Bed from frame 0; one deliberate dip on the key moment (A6) | "dip as the answer lands" |

And the **cards** table: intro `hero` (title + subtitle), mid-cut `section` cards as a question
("Where did signups come from?"), last item `end` (title, tagline, logo; then a brand sweep and logo
outro). Every title and subtitle gets exactly **one accent word**, the key noun (T9). Plan the
first product UI by 6 s (O4) and about 13 s from the last UI frame to the end (X4).

## Step 5: RUN-SHEET.md

For each beat: where, the pointer action, the exact text typed on camera, the expected result and
how long it takes, a voiceover draft, and an **Edit plan** line (window region, pill, zoom,
highlight selector), as in the sample. Typed text reads like a real person with a goal.

## Step 6: VOICEOVER.md

Rules (full guide `$P/references/voiceover.md`):

- Spoken English, present tense, second person. Point at what is on screen and say why.
- About 2.5 words per second of the time the line plays over. Write the word count after each line.
- Narration covers at least half the runtime (A1): a voiced card or scene every 6 to 10 s, nothing
  over the outro. The end card's line says the end-card title words, in order, so they can be
  revealed as they are spoken (X1).
- No em dashes, parentheses or symbols. Spell out URLs ("acme dot com slash billing") and amounts
  ("twelve hundred dollars").
- Claim only what the footage will show.

## Step 7: PREP.md and demo.json

Tick each PREP.md box as you do it: sandbox accounts, a dedicated demo user with seeded data, seed
and reset scripts in `tools/`, timezone and locale, clutter list, secret patterns, one instance of
every service, a smoke run.

Then fill:

- `demo.json` `sequence`: the scenes and title cards in story order, straight from the Edit plan:
  cards with `kind` and `accent`; each scene with `crop`, `callouts`, and `zooms`/`highlights`
  where planned (leave `focus` and `rect` as your best estimate from a screenshot; the record step's
  scout replaces them with measured values); `voiceover` on the items that speak; `voice.music`
  (`music/bed.m4a`) and one `voice.music_dips` entry. Shape: `$P/schemas/demo.schema.json`.
  Example: `$P/samples/plan/demo.json`. Add `brand` (`font`, `accent`, `logo_on_dark`) when the
  product has its own accent colour, `browser.timezone` if the UI shows times, and `windows` for a
  two-person demo. Old `caption` and `zoom` fields still build but do not reach the bar.
- `recordings/scenes/_project.js`: start from `$P/samples/scenes/_project.js`:

| Setting | Default | Change when |
| --- | --- | --- |
| `cursor` | `'dot'` | Never for a bar cut: the blue disc with a white ring is the quality-bar cursor (K1); `'arrow'`/`'hand'` only if the user asks |
| `maskPatterns` | `[]` | The product has its own token prefix (`'\\bwf_(live|test)_\\w{16,}'`) |
| `maskLabels` | `[]` | A secret sits next to a label like "Ingest key" |
| `clutter` | `[]` | Any banner or toast shows. Use its full wording, never a short word |

Check demo.json against the schema:

```bash
python3 -I -c 'import importlib.util,json,sys; s=importlib.util.spec_from_file_location("d", sys.argv[1]+"/scripts/demolib.py"); d=importlib.util.module_from_spec(s); s.loader.exec_module(d); e=d.validate(json.load(open("demo.json")),"demo"); print("\n".join(e) or "ok")' "$P"
```

Expected: `ok`. Otherwise each line names a field (`sequence[3].callouts[0]: missing required field 'at'`); fix it.

## Step 8: claims check

Every row of the claims list in BRIEF.md names a scene in SHOT-LIST.md. If not, cut the claim.

## Step 9: test sweep

From `$P/references/quality-gates.md` section 2. Off camera, from a freshly reset state:

1. Run each scene's action in order. Each ends in the expected visible state.
2. Run each edge-case scene. Each ends in a clear message, not a spinner or a raw error.
3. Run the hero flow twice in a row. The second run must pass too.
4. Check every URL in the script, captions and cards with `curl -sI <url>` (expect 200 or a redirect).

Write a table in the demo's README.md under **Test sweep**: path, how checked, `pass` or the fix.
Fix each failure, or cut the scene and its claim.

| A sweep step would | Do this |
| --- | --- |
| Create something you can delete later | Do it, add it to THROWAWAYS.md |
| Send to a real address, publish, or create something that cannot be deleted | Stop and ask (a stop case) |
| Cost money | Stop and ask (a stop case) |
| Hit a login page | Log in again with skill `demo-record` Step 0, then go on |

## Step 10: post a progress note and keep going

Post the scene table and a three-line story summary as a note, then go straight on to skill
`demo-record` in the same turn. **Do not wait for a reply.** Wait only if the user asked to check
the plan first.

## Done when

- [ ] BRIEF.md has "Our reading" filled and a claims list
- [ ] SHOT-LIST.md has every scene with caption, length, depends on and recipe
- [ ] The Edit plan table has a window region, pill, zoom target, highlight selector and music
      note for every scene, and the cards table has a kind and one accent word per title
- [ ] RUN-SHEET.md has the exact typed text for every beat
- [ ] VOICEOVER.md has every line with a word count
- [ ] demo.json validates (`ok`) with crop, callouts, zooms, highlights, accents, voice and music;
      `_project.js` has the masks, clutter and `cursor: 'dot'`
- [ ] Every PREP.md box is ticked
- [ ] The test sweep table has `pass` on every row
- [ ] The scene table was posted as a progress note (not a question)
- [ ] Next: skill `demo-record`, Step 0
