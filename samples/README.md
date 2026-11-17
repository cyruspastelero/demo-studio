# Samples

Starting points to copy. Each scene recipe is a working scene body in the exact shape the
recorder runs, for a common kind of step. The sample plan is a full set of planning documents for
a fictional analytics product, filled in to the standard we aim for.

**These are templates.** The URLs (`app.example.com`), labels, button names and on-screen text are
placeholders. Before you record, run a scout body on the real product (see
`references/scene-patterns.md`, "Scout run"), then swap in the real locators and text.

## Scene recipes (`scenes/`)

Every recipe starts with the same header: **USE WHEN** (pick by this), **CHANGE** (every line
marked `// CHANGE:` must be edited: URL, labels, typed text, take name) and **VERIFY AFTER THE TAKE**
(what to check on the contact sheet and in the returned summary).

How to use one:

1. `command cp "$P/samples/scenes/<recipe>.body.js" <demo>/recordings/scenes/<NN-name>.body.js`
2. Run a scout body on the real page to get the real labels.
3. Edit every `// CHANGE:` line. `grep -n "CHANGE:" <file>` lists them.
4. Record it (skill `demo-record`, Step 2), then do the VERIFY list.

| Recipe | Use this when |
| --- | --- |
| [`_project.js`](scenes/_project.js) | Every demo. Cursor style, secret shapes and labels to mask, clutter to hide |
| [`form-validation.body.js`](scenes/form-validation.body.js) | A form where the error is part of the story: submit, read the error, fix it, succeed |
| [`dashboard-tour.body.js`](scenes/dashboard-tour.body.js) | A long page shown section by section: scroll, settle, point, park |
| [`secret-reveal.body.js`](scenes/secret-reveal.body.js) | Setup creates an API key or token on camera and it must stay masked |
| [`ai-chat-reply.body.js`](scenes/ai-chat-reply.body.js) | An AI assistant, bot or chat reply is the hero moment and you wait for it |
| [`modal-dialog.body.js`](scenes/modal-dialog.body.js) | An invite, share, confirm or "new item" dialog, then the result behind it |
| [`settings-toggle.body.js`](scenes/settings-toggle.body.js) | A switch whose effect the viewer must see: before, flip, after |
| [`table-search-filter.body.js`](scenes/table-search-filter.body.js) | Finding one record in a list with search and a filter |
| [`two-person-handoff-a.body.js`](scenes/two-person-handoff-a.body.js) and [`-b`](scenes/two-person-handoff-b.body.js) | Two people in two windows: one asks, the other approves (`rec.mjs`) |

Every recipe follows the house look in [`references/style-guide.md`](../references/style-guide.md):
`prep` then `placeCursor` before `record`, a 1 to 1.5s head, glides and pauses before clicks,
`park` after each action, waits on real UI signals, a 2 to 3s tail, and a small summary returned.

For more shapes (long text by paste, file upload, links that open a new tab, a local answer
server, terminals), see [`references/scene-patterns.md`](../references/scene-patterns.md). For a
real recorded example, see [`examples/todo-sample`](../examples/todo-sample).

## Sample plan (`plan/`)

Wrenfield Analytics, a made-up web analytics product with an assistant. Use it to see how much
detail each planning document needs, then write your own from the templates `new-demo.sh` copies.

| File | What to learn from it |
| --- | --- |
| [`BRIEF.md`](plan/BRIEF.md) | Goal, audience, must-show and must-not-say, and a claims list where every claim names its proving scene |
| [`SHOT-LIST.md`](plan/SHOT-LIST.md) | Scenes with captions, lengths, "Depends on", the recipe each starts from, and which videos use which scenes |
| [`RUN-SHEET.md`](plan/RUN-SHEET.md) | Beat by beat: the action, the exact text typed, the expected result and its latency, a voiceover draft |
| [`VOICEOVER.md`](plan/VOICEOVER.md) | Lines written for the ear, with word counts and timing windows, plus notes for the voice |
| [`demo.json`](plan/demo.json) | The keynote cut: cards, trims, speeds, two hero zooms, captions, voiceover lines and a `voice` block |

The `voice` block leaves `provider` unset, so the narrate step picks your own recordings, then
ElevenLabs if `ELEVENLABS_API_KEY` is set in your shell, then macOS `say`. It names a music bed at
`assets/bed.mp3`: add your own file there or delete the `music` line.

## Adding a sample

A new recipe is welcome when it covers a kind of step the others do not. Keep it product-agnostic
(placeholder URLs, role and label locators, fictional names), give it the same header (RECIPE, USE
WHEN, CHANGE, VERIFY AFTER THE TAKE), mark every line to adapt with `// CHANGE:`, add a row above,
and check it parses:

```bash
f=samples/scenes/<name>.body.js; { echo 'async (page) => {'; cat "$f"; echo '}'; } > /tmp/chk.js && node --check /tmp/chk.js
```
