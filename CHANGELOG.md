# Changelog

Notable changes, newest first. Versions follow semver as described in CONTRIBUTING.md.

## 0.2.0 (unreleased)

First open-source release.

- License changed to Apache-2.0, with a NOTICE file.
- Starter kit: `scripts/new-workspace.sh` installs a playbook (`AGENTS.md`), `CLAUDE.md`, a demos
  index and `check.py`, a drift report for the whole workspace.
- Quality gates: `references/quality-gates.md` adds the claims list, the test sweep and dead-end
  hunt before filming, the cold follow-through before sending, and close-out. The skills enforce them.
- Optional Cardboard finishing path: the `demo-cardboard` skill, `scripts/cardboard-timeline.py`
  and `references/cardboard.md`. Everything still works without Cardboard.
- Home screen: `npm run studio` with no folder opens a page with one card per demo (stages, what
  needs attention, videos, documents, the next thing to ask Claude), and a first-run guide.
- The default cursor is now the normal arrow, moved with easing on a slight arc (`moveHuman`,
  `placeCursor`). The blue dot remains as `PROJECT.cursor = 'dot'`.
- `doctor.sh` reports whether the Cardboard CLI is present (optional).
- CI on GitHub Actions; contributing guide moved to the repo root; SECURITY.md and issue templates added.

## 0.1.0 (2026-10-31)

Internal release: the plan, record, edit and handoff skills, the pipeline scripts, config schemas,
templates, a worked example, the local editor and the smoke test.
