# demo-studio

This repo is both the skill pack and a place to make demos. It works with any coding agent that reads
skills (`SKILL.md` folders) or `AGENTS.md`: Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot,
OpenCode and others. The skills live in `skills/`; `.agents/skills/`, `.claude/skills/`,
`.cursor/skills/` and `.gemini/skills/` are links to them, so each agent finds them where it looks.
An agent without skill support can open `skills/<name>/SKILL.md` and follow it step by step.

Every demo lives in `./demos/`, which git ignores, so your recordings and accounts never end up in a
commit.

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
- Keep it agent-agnostic: skills and docs say "the agent", and name a specific agent only for a
  command that only that agent has.
- Commits: conventional commits (`feat:`, `fix:`, `docs:` ...).
