# Changelog

Notable changes, newest first. Versions follow semver as described in CONTRIBUTING.md.

## Unreleased

- Removed the Cardboard path (skill, timeline script and reference). The built-in finish
  (keynote cut plus `narrate.py`) is the only one; the editor is moving to parity instead.

## 0.2.0 (2026-11-17)

First open-source release.

- License changed to Apache-2.0, with a NOTICE file.
- Starter kit: `scripts/new-workspace.sh` installs a playbook (`AGENTS.md`), `CLAUDE.md`, a demos
  index and `check.py`, a drift report for the whole workspace.
- Quality gates: `references/quality-gates.md` adds the claims list, the test sweep and dead-end
  hunt before filming, the cold follow-through before sending, and close-out. The skills enforce them.
- `examples/todo-sample`: a real demo recorded and cut with the plugin, shown at the top of the README.
- Fixed: an empty `clutter` list (the template default) hid most of the page before a take.
- Home screen: `npm run studio` with no folder opens a page with one card per demo (stages, what
  needs attention, videos, documents, the next thing to ask Claude), and a first-run guide.
- The default cursor is now the normal arrow, moved with easing on a slight arc (`moveHuman`,
  `placeCursor`). The blue dot remains as `PROJECT.cursor = 'dot'`.
- CI on GitHub Actions; contributing guide moved to the repo root; SECURITY.md and issue templates added.
- Free narration: `scripts/narrate.py` adds the voiceover lines in `demo.json` to the keynote cut,
  with macOS `say`, your own recordings or (optional) ElevenLabs, an optional ducked music bed and
  loudness normalising. It is the default finish in the `demo-edit` skill.
- `references/style-guide.md`: one guide to the house look (capture, framing, pointer, typing,
  pacing, zoom, captions, cards, colour, voiceover, music, social crops, a do and don't table).
- `samples/`: scene recipes to copy (form with an error, dashboard tour, masked secret, AI reply,
  dialog, settings toggle, table search and filter, two-person handoff), each with a USE WHEN /
  CHANGE / VERIFY header, and a full sample plan for a fictional analytics product.
- Skills rewritten as numbered steps with copy-paste commands, expected output, failure tables,
  decision tables and "done when" checklists, so smaller models can follow them.
- README reworked for first-time visitors: a short "Start here", a "First demo in 10 minutes" on
  the todo sample (also what the orchestrator suggests for "try it"), and a style summary.
- The starter playbook points at the style guide and samples and sets the narration voice order.

## 0.1.0 (2026-10-31)

Internal release: the plan, record, edit and handoff skills, the pipeline scripts, config schemas,
templates, a worked example, the local editor and the smoke test.
