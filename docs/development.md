# Development

[Back to the README](../README.md)

## Repo layout

```
.claude-plugin/   plugin.json, marketplace.json
skills/           demo-studio (orchestrator), demo-plan, demo-record, demo-edit, demo-handoff
scripts/          every tool (recorder, QA, encode, edit, narrate, handoff, social, scaffold, doctor)
references/       style guide, learnings, quality gates, scene patterns, voiceover, handoff spec,
                  secrets
samples/          scene recipes to copy and a sample plan
examples/         acme-invoice-bot (a filled-in fictional plan) and todo-sample (a real, recorded demo)
templates/        files new-demo.sh copies into a new demo
starter/          the workspace kit new-workspace.sh installs: playbook, index, check.py
schemas/          demo.schema.json and handoff.schema.json (the config shapes the scripts check)
app/              local editor: React UI (src/), file and render server (server/), tests (e2e/)
tests/            smoke.sh (end to end on synthetic footage) and unit tests for the Python tools
docs/             ROADMAP.md, img/ (screenshots and the sample GIF)
```

## Tests

The keynote engine is `scripts/build-keynote.py` with its modules in `scripts/keynote/` (spec,
easing, model, timeline, window, overlay, brand, render, compose, voice_sync, measure) and the
Chrome page in `scripts/keynote-page.mjs` + `keynote-render.mjs`. Every look value comes from
`docs/quality-bar.md`; change the bar first, then `keynote/spec.py`, then the tests.

```bash
npm install && bash tests/smoke.sh   # pipeline on synthetic footage, ending in the quality-bar checklist
python3 -I tests/test_check.py && python3 -I tests/test_narrate.py && python3 -I tests/test_keynote.py && python3 -I tests/test_motion.py
node tests/test_lib.mjs && node tests/test_card_safety.mjs && node tests/test_frame_receiver.mjs
npm run test:app                     # editor unit tests (vitest)
npm run test:e2e                     # editor end to end, headless Chrome on a temp copy of the example
npm run screenshots -w app           # refresh docs/img/
```
