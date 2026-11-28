# Development

[Back to the README](../README.md)

## Repo layout

```
.claude-plugin/   plugin.json, marketplace.json
skills/           demo-studio (orchestrator), demo-plan, demo-record, demo-edit, demo-handoff, demo-organize,
                  demo-template, demo-motion
scripts/          every tool (recorder, QA, encode, edit, narrate, handoff, social, scaffold, doctor)
                  QA: check-cut (keynote cut), video-gate (any finished mp4), plan-lint (demo.json before recording),
                  check-release (secrets, personal paths, emails; allowlist in .release-allow)
references/       style guide, learnings, quality gates, scene patterns, voiceover, handoff spec,
                  secrets
samples/          scene recipes to copy and a sample plan
examples/         acme-invoice-bot (a filled-in fictional plan), todo-sample (a real, recorded demo),
                  launch-ad (the demo-studio launch ad storyboard) and motion-gallery (every scene type)
templates/        files new-demo.sh copies into a new demo
starter/          the workspace kit new-workspace.sh installs: playbook, index, check.py
schemas/          demo, handoff and template schemas (the config shapes the scripts check)
look-templates/   built-in look templates (house = the default look), docs/templates.md
motion/           launch-ad engine: storyboard -> beat-synced motion-graphics ad (docs/motion.md)
motion-templates/ launch-ad styles (airy, daylight, midnight-ad, nocturne, showroom) with ANALYSIS.md or style notes and previews
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
python3 -I tests/test_check.py && python3 -I tests/test_narrate.py && python3 -I tests/test_keynote.py && python3 -I tests/test_text_overlays.py && python3 -I tests/test_motion.py && python3 -I tests/test_templates.py && python3 -I tests/test_security.py && python3 -I tests/test_video_gate.py && python3 -I tests/test_plan_lint.py && python3 -I tests/test_check_release.py && python3 -I tests/test_config_errors.py
bash tests/smoke-templates.sh        # todo sample with and without "template": "house" (heavy: two builds)
node tests/test_lib.mjs && node tests/test_card_safety.mjs && node tests/test_fonts.mjs && node tests/test_frame_receiver.mjs && node tests/test_security.mjs
npm run test:motion                  # launch-ad engine: validator, beat maths, text fitting (no browser)
python3 -I scripts/check-release.py # release scan of tracked files; add --range BASE..HEAD for the commits of a change (CI does)
npm run test:app                     # editor unit tests (vitest)
npm run test:e2e                     # editor end to end, headless Chrome on a temp copy of the example
npm run screenshots -w app           # refresh docs/img/
```

## The homepage

`site/index.html` is the demo page at https://demo-studio.pastelero.ph/, a Vercel project
(`demo-studio`) with no git link. The Site workflow (`.github/workflows/site.yml`) builds it on
every push that touches the site and keeps the result as an artifact named `site`. To publish it:

```bash
gh run download <run id> -n site -D /tmp/site && cd /tmp/site && npx vercel deploy --prod --project demo-studio
```

The workflow's build steps:

1. `npm run build -w app && npm run build:static -w app` makes the live editor: a server-less build
   of the studio (`vite build --mode static`), plus `app/scripts/snapshot-static-demo.mjs`, which runs
   the real studio on `examples/todo-sample` with an empty demos root and records every read the app
   makes into `app/out-static/data/`. Local paths are replaced with `~/...` before saving. In that
   build, edits stay in the tab and rendering explains that it needs the local studio.
2. `bash scripts/build-site.sh _site <folder with sample-*.mp4>` puts the page, logo, fonts, posters,
   the house template frames and the editor (as `editor/`) together. The workflow downloads the
   sample videos from the `samples` release, so they never go into git. That includes the four short
   muted loops in "Pick a look" (`sample-look-<id>.mp4`, 1280x720, under 2 MB each); their posters
   are `docs/img/sample-look-<id>-poster.jpg`. Upload a new clip with
   `gh release upload samples sample-look-<id>.mp4 --clobber`.

To preview locally, run both steps and serve `_site` with `python3 -m http.server`.
