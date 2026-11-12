# Contributing

Every demo teaches something. Put it back here so the next person does not re-learn it.

## Set up

```bash
git clone https://github.com/Cyvid7-Darus10/demo-studio.git
cd demo-studio && npm install
bash scripts/doctor.sh
claude --plugin-dir "$PWD"      # load your working copy instead of the installed plugin
```

## What goes where

| Change | Where |
| --- | --- |
| A gotcha that cost a re-shoot | `references/learnings.md`, one bullet, in the right section, saying what to do |
| A reusable scene technique | `references/scene-patterns.md`, with a short code sample |
| Voiceover or handoff rules | `references/voiceover.md`, `references/handoff-spec.md` |
| Secret-handling rules | `references/secrets.md` |
| When Claude should do or ask something | the stage's `skills/<name>/SKILL.md` |
| A gate a stage must pass | `references/quality-gates.md`, and the skill that enforces it |
| Workspace playbook, index or drift checks | `starter/` (`check.py` has tests in `tests/test_check.py`) |
| Anything Cardboard | `references/cardboard.md`, `skills/demo-cardboard/`; it must stay optional |
| A tool | `scripts/`, referenced from skills as `$P/scripts/...` (`P` = `${CLAUDE_PLUGIN_ROOT}`) |
| A new config field | `schemas/*.schema.json` first, then the script, the template and the example |
| The local editor | `app/`; run `npm run test:app` and `npm run test:e2e`, and refresh `docs/img/` with `npm run screenshots -w app` after visible changes |

Keep skills and scripts product-agnostic: no customer names, account ids, emails, internal team
names or keychain items. Demo-specific helpers (seed, reset, answer servers) belong in the demo's
own `tools/` folder, not here.

## Script rules

- Python: 3.10+, standard library only. Load shared helpers from `scripts/demolib.py` by path (see
  any script's `load_demolib`) so scripts keep working under `python3 -I`.
- Node: 20+, only `playwright-core` (imported through `scripts/pw.mjs`).
- Shell: `set -euo pipefail`, and it must run on macOS bash 3.2 (no associative arrays, no `mapfile`).
- Render scripts validate their config against `schemas/` before any work and print
  `PROGRESS <stage> <done>/<total>` and `OUTPUT <path>` lines; the local editor (`app/`) reads them.
- Keep the quality defaults: raw takes CRF 14 `-preset slow`, lanczos scaling, constant 30fps, DPR 2
  capture. Change them only with a reason in the commit message.
- Errors name the operation that failed and how to fix it. Never swallow an error.
- Copy (docs, skills, comments, generated text) is plain English with no em dashes. Comments only
  where the why is not obvious.

## Test

```bash
bash tests/smoke.sh            # KEEP=1 keeps the temp folder to inspect outputs
python3 -I tests/test_check.py
python3 -I tests/test_cardboard_timeline.py
claude plugin validate .
```

Add a check to `tests/smoke.sh` for any new script or output.

## Release

1. Bump `version` in `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` and
   `package.json` (semver: patch for fixes and docs, minor for new tools or fields, major when an
   existing `demo.json` or `handoff.json` stops validating).
2. Commit with a conventional message (`feat:`, `fix:`, `docs:`...) and push to `main`.
3. Add the release to `CHANGELOG.md`, tag it (`git tag v0.2.0 && git push --tags`) and publish a
   GitHub release with the same notes.
4. Users update with `/plugin marketplace update demo-studio`, then re-run
   `npm install --prefix <new plugin folder>` (each version gets its own folder) and `doctor.sh`.
