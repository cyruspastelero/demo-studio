# Getting started

[Back to the README](../README.md)

## Requirements

We use **Playwright** (the Playwright MCP server and `playwright-core`), not Puppeteer.

| Need | Why | Install |
| --- | --- | --- |
| A coding agent with MCP | Runs the skills: Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot or another agent that reads skills or `AGENTS.md` | Your agent's installer |
| Node.js 20+ (22 LTS recommended) | Frame receiver, recorder, title cards | `brew install node` |
| Google Chrome | The recorded browser and the title-card renderer | `brew install --cask google-chrome` |
| Playwright MCP | The agent drives and records the browser through it | [Set up your agent](#set-up-your-agent) |
| `playwright-core` | Recording, title cards and text overlays | `npm install` in the repo |
| Local editor packages (optional) | The `npm run studio` editor (React, Vite, ajv); about 150 MB | The same `npm install` |
| Python 3.10+ | Edit, narration, handoff and QA scripts; standard library only, no pip | `brew install python` |
| ffmpeg with libx264 | All encoding and the audio mix | `brew install ffmpeg` |
| 10 GB+ free disk | Raw frames take several GB per demo | |
| macOS `say` (optional) | Free narration, the voiceover fit check and timing preview | Built into macOS |
| Sandbox or test accounts | Everything filmed must be safe to show | Per product |

It is built and used on macOS. The scripts avoid macOS-only tools (`say` is optional) and CI runs
the pipeline on Linux, but recording on Linux or Windows has had far less use. Reports are welcome.

## Set up your agent

Your agent needs one MCP server, Playwright, using real Chrome. The command is the same everywhere:

```bash
npx -y @playwright/mcp@0.0.84 --browser chrome
```

Add it the way your agent adds MCP servers:

| Agent | How |
| --- | --- |
| Claude Code | `claude mcp add playwright --scope user -- npx -y @playwright/mcp@0.0.84 --browser chrome` |
| Codex | In `~/.codex/config.toml`: `[mcp_servers.playwright]` with `command = "npx"` and `args = ["-y", "@playwright/mcp@0.0.84", "--browser", "chrome"]` |
| Cursor | In `.cursor/mcp.json` (this project) or `~/.cursor/mcp.json` (every project): the JSON below |
| Gemini CLI | In `~/.gemini/settings.json`: the JSON below |
| GitHub Copilot (VS Code) | In `.vscode/mcp.json`: the JSON below, with `"servers"` in place of `"mcpServers"` |
| Others | Add a stdio MCP server named `playwright` with the command above |

```json
{ "mcpServers": { "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@0.0.84", "--browser", "chrome"] } } }
```

The skills need no setup in a clone: `.agents/skills/` (Codex, Cursor, Copilot and others),
`.claude/skills/`, `.cursor/skills/` and `.gemini/skills/` all link to `skills/`, and `AGENTS.md` (read
by most agents; Claude Code and Gemini CLI import it from `CLAUDE.md` and `GEMINI.md`) says how to work
here. An agent without skill support can open `skills/demo-studio/SKILL.md` and follow it.

## Install

You need macOS (Linux works with less testing), a coding agent, and a sandbox account for the product
you want to film.

**1. Get demo-studio and check your setup:**

```bash
brew install node ffmpeg python && brew install --cask google-chrome
git clone https://github.com/cyruspastelero/demo-studio.git
cd demo-studio
npm install
bash scripts/doctor.sh
bash scripts/new-workspace.sh ./demos
```

`doctor.sh` checks everything and prints the exact fix for anything missing. Your demos live in
`demos/`, which git ignores.

**2. Add Playwright MCP** to your agent: [Set up your agent](#set-up-your-agent).

**3. Open your agent in the repo folder** and say what you want:

> Make a demo of app.example.com. Goal: a new user creates a project and invites a teammate.
> Audience: small team leads. I'm logged in to the sandbox in the Playwright browser.

or, handing over the account:

> Make a demo of app.example.com. Goal: a new user creates a project and invites a teammate.
> The sandbox login is demo@example.com; the password is in Keychain as demo-acme.

**Using Claude Code?** You can also install it as a plugin and use it from any folder:

```
/plugin marketplace add cyruspastelero/demo-studio
/plugin install demo-studio@demo-studio
```

Then run `npm install --prefix "$P"` once, where `P="$(ls -d ~/.claude/plugins/cache/demo-studio/demo-studio/*/ | tail -1)"`.

## Getting the agent into your product

Use a sandbox or test account, and pick one of two ways:

1. **Log in yourself.** The agent opens the login page in the browser the Playwright MCP opens (not
   your everyday Chrome) and you log in there. If you use your own Playwright MCP profile, remember
   it is logged in as you.
2. **Hand over demo credentials.** The agent logs in for you before recording starts, so the login is
   never filmed. The safest way keeps the password out of the chat: store it in macOS Keychain
   yourself, in a Terminal window (it prompts for the password and does not echo it), then tell the
   agent the item name:
   ```bash
   security add-generic-password -s demo-acme -a 'demo@example.com' -w
   ```
   The agent reads it only to log in, never repeats it, and writes it to no file (a gitignored
   `app/.env` only if you ask for one). If the site asks for a 2FA code, it asks you for it at that
   moment. It refuses credentials for an account with real customer data unless you confirm it is a
   test account.

## What happens next

1. The agent writes the plan and shows it to you: the scenes, what each one shows, the voiceover, the
   look, and anything it will create in the app.
2. Nothing is recorded until you reply "go" (or tell it what to change).
3. Then it runs every stage to the end without asking, and shows you the results: the plan, a clean
   1080p take per scene, a review reel, the finished video and a narrated version. Promo and how-to
   cuts, 4:5 and 9:16 versions and a package for a video editor come when you ask.

After the go, it only stops for a login or 2FA code, a step that would cost money or create something
it can't delete, or deleting your data. Want to see it work first? Do the
[first demo in 10 minutes](#first-demo-in-10-minutes).

## First demo in 10 minutes

No account or login needed. This records and cuts [examples/todo-sample](../examples/todo-sample), a
public todo app, so you see the whole pipeline once. After the setup above, open your agent in the
repo folder and say:

> Try demo-studio on the todo sample.

The agent then:

1. Copies the sample into `demos/todo-sample/` (its plan and three scene scripts are already written).
2. Starts the recorder and opens the todo app in the Playwright browser at 2x.
3. Records the three scenes, checks each one on a contact sheet, and encodes the takes.
4. Shows you the review reel, then builds the keynote cut (window, pills, highlight boxes, zooms,
   cards), narrates it and runs the quality-bar checklist on it.
5. Narrates it with macOS `say` (or your own voice, or ElevenLabs when you ask for it with `--voice elevenlabs`) and opens
   `demos/todo-sample/recordings/exports/todo-app-sample-keynote-cut-narrated.mp4`.

To do the same steps by hand, follow the commands in [examples/todo-sample/README.md](../examples/todo-sample/README.md).

## Starter kit

A demos folder works better with a playbook and an index. One command adds them (it never
overwrites a file that is already there):

```bash
bash "$P/scripts/new-workspace.sh" ./demos
```

| File | What it is |
| --- | --- |
| `AGENTS.md` | The playbook the agent reads first: modes, how much to ask, stage gates, house rules, folder layout. Edit it to fit your team; it wins over the plugin's defaults |
| `CLAUDE.md` | Points Claude Code at the playbook and the session routine (other agents read `AGENTS.md` directly) |
| `README.md` | The index: one row per demo with its status and final cut |
| `check.py` | A drift report: index rows that point nowhere, takes nobody reviewed, throwaways never deleted, leftover frames, stray secrets files, low disk |
| `.gitignore` | Keeps recordings, zips, voice caches, browser profiles and `.env` files out of git |

Each demo then gets its own folder from `new-demo.sh` (the agent runs it): brief, run sheet, shot list,
voiceover draft, prep checklist, throwaways list, `demo.json` and `handoff.json`.
