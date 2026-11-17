# demo-studio

This repo is both the plugin and a place to make demos. When Claude Code runs in a clone of it,
the skills load from `.claude/skills/` (links to `skills/`) and every demo lives in `./demos/`,
which git ignores, so your recordings and accounts never end up in a commit.

## Making demos here

- Demos live in `./demos/<name>/`. On the first run, set the folder up once:
  `bash scripts/new-workspace.sh ./demos` (adds the playbook, the index and `check.py`).
- To make a demo, use skill `demo-studio`. To tidy the folder, use skill `demo-organize`.
- Read `./demos/AGENTS.md` before working on a demo; it holds the team's own rules.
- The plugin root (`$P` in the skills) is this repo's root.
- Run `python3 -I demos/check.py` at the start and end of a session.
- The local dashboard and editor: `npm install` once, then `npm run studio` (it opens `./demos`).

## Working on the plugin itself

- Docs: `docs/` (getting started, how it works, studio, quality bar, FAQ, development).
- Tests: see `docs/development.md`. Run heavy jobs (smoke test, e2e, renders) one at a time.
- Keep the repo product-agnostic: no client or product names, account ids or emails anywhere
  outside `./demos/`.
- Commits: conventional commits (`feat:`, `fix:`, `docs:` ...).
