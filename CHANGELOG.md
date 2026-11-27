# Changelog

Notable changes, newest first. Versions follow semver as described in CONTRIBUTING.md.

## Unreleased

- **Looks refreshed**: the four built-in looks now draw titles in one colour (a card's `accent` is
  ignored unless a look sets `title.accent_word: true`, which the engine now honours). `house` moves
  to warm greys with an ember glow and an ember sweep, `midnight` to graphite with an ember glow and
  blur-in titles, `paper` and `mono` get quieter title weights. Previews re-rendered.
- **Link preview image** matches the new homepage.
- **Pill timing in the editor**: set a `demo.json` pill to a time or to a spoken word of its scene's voiceover, with an offset and an estimate of where it lands.
- **License is now MIT** (was Apache-2.0). NOTICE now only credits the bundled fonts.
- **New homepage at https://demo-studio.pastelero.ph**: a sticky intro with a list that follows
  your scroll, one screen per feature, and the live editor. It is served from Vercel; GitHub Pages is retired.
- **`video-gate.py`**: checks any finished mp4 with no plan file: a blank picture (FAIL at 1 s), the
  longest frozen and quiet stretches (LOOK), decoding to the end (FAIL) and a missing audio stream
  (LOOK). The edit and motion skills run it on every cut `check-cut.py` does not cover (G1 to G4a in
  `docs/quality-bar.md`).
- **`plan-lint.py`**: reads only `demo.json`, before anything is recorded. Flags a number on screen
  that the voiceover does not say (N1) and three scenes in a row that zoom at once or repeat a
  callout position (N2). The plan skill runs it before the plan goes to the user.
- **Launch-ad monotony warning**: `render-motion.mjs --check` now warns when three or more scenes in
  a row share a `type` or a non-default exit.
- **`check-release.py`**: scans tracked files, and with `--range` the added lines, commit messages and
  file names of each commit, for secret-shaped strings, personal home paths, real email addresses
  and files that must never be tracked. The allowlist is `.release-allow`. CI runs it as its own job.
- **Word cues**: a zoom, callout or highlight `at` can be a spoken word, such as
  `{"word": "invite", "nth": 1, "offset": -0.2}`, instead of seconds.
- **Cold read**: a new review step after the checkers pass, where a reviewer who did not build the
  cut checks it for facts against the brief and the voiceover (`references/quality-gates.md`).
- **Render checks in the editor**: the render drawer runs the checks after a render and lists what
  needs fixing.
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
