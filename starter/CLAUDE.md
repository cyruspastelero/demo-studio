# Demos: context for Claude

**Read [AGENTS.md](AGENTS.md) first.** It is the process for every demo here: modes, stages and
gates, house rules and close-out.

- Run `python3 -I check.py` at the start and end of every session, and fix what it reports for the demo you touched.
- Recording, editing and handoff mechanics come from the demo-studio plugin. Read its `references/learnings.md` before the first take.
- Each demo's `README.md` holds its context. Read it before touching that demo, and add a dated Status entry when you finish.
- Keep the index table in `README.md` current (status words in AGENTS.md section 6).
- Start Claude Code in this folder, so Playwright MCP's `.playwright-mcp/` folder lands here.
- Never write secrets into any file here except a demo's gitignored `app/.env`.
