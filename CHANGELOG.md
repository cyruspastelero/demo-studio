# Changelog

Notable changes, newest first. Versions follow semver as described in CONTRIBUTING.md.

## Unreleased

- **Editor opens on the real cut**: when `handoff.json` is still the scaffold template, the editor
  opens on `demo.json` instead. On a file that is still the template, a banner above the timeline
  says so and offers the filled-in file, so placeholder scenes no longer look like lost edits (#3).

## 0.3.0 (2026-11-18)

- **Finished cuts at a measured quality bar** (`docs/quality-bar.md`): bundled Inter and Geist, a
  soft colour-field background, a cropped floating window with eased zooms, callout pills,
  highlight boxes in the product's own colour (only on UI that holds still), word-by-word titles
  with an accent word, an end card, 5 Mbps BT.709 encodes. `check-cut.py` runs the checklist frame
  by frame and the skills refuse to call a cut finished until it passes.
- **Narration and music**: ElevenLabs by API key (environment or macOS Keychain) or through the
  ElevenLabs or Higgsfield MCP (`narrate.py --export-lines`), own recordings, or `say`; music beds
  held steadily under the voice, -14 LUFS. Paid voices need `--voice elevenlabs`.
- **Look templates and a template copier**: `"template": "<id>"` in demo.json; the
  `demo-template` skill measures any reference video into a reusable template; built-in `house`.
- **Studio**: a dashboard (stats, needs attention, demo cards), Prompts and Templates menus, a
  raw-take viewer, System, Light and Dark themes, in the guide site's design system.
- **Hands-off flow**: log in yourself or hand Claude sandbox credentials (Keychain, never files or
  camera); it then runs every stage without asking. Clone the repo and work in `./demos`.
- **demo-organize** skill and stronger `check.py` (loose videos, misplaced handoffs, broken links).
- The pointing hand is the default cursor; the dot is gone.
- **Security**: two full audits closed. Untrusted demo folders, sidecars and templates are
  validated and confined; title and overlay pages are sandboxed with no network; ffmpeg reads with
  protocol and demuxer whitelists; the studio has a CSP and refuses cross-site requests; temp
  files are O_EXCL; CI actions are SHA-pinned. See SECURITY.md.
- `docs/dependencies.md` lists every tool, package and font with versions and licences.
- Removed the Cardboard path; the built-in finish is the only one.

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
  `placeCursor`).
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
