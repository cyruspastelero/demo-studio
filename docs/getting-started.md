# Getting started

[Back to the README](../README.md)

## Requirements

We use **Playwright** (the Playwright MCP server and `playwright-core`), not Puppeteer.

| Need | Why | Install |
| --- | --- | --- |
| Claude Code with plugin support | Runs the skills | `npm i -g @anthropic-ai/claude-code` |
| Node.js 20+ (22 LTS recommended) | Frame receiver, recorder, title cards | `brew install node` |
| Google Chrome | The recorded browser and the title-card renderer | `brew install --cask google-chrome` |
| Playwright MCP | Claude drives and records the browser through it | See below |
| `playwright-core` | Used by `rec.mjs` (multi-window recording), `run.mjs` and `title-cards.mjs` | `npm install --prefix "$P"` |
| Local editor packages (optional) | The `npm run studio` editor (React, Vite, ajv); about 150 MB | The same `npm install` |
| Python 3.10+ | Edit, narration, handoff and QA scripts; standard library only, no pip | `brew install python` |
| ffmpeg with libx264 | All encoding and the audio mix | `brew install ffmpeg` |
| 10 GB+ free disk | Raw frames take several GB per demo | |
| macOS `say` (optional) | Free narration, the voiceover fit check and timing preview | Built into macOS |
| Sandbox or test accounts | Everything filmed must be safe to show | Per product |

It is built and used on macOS. The scripts avoid macOS-only tools (`say` is optional) and CI runs
the pipeline on Linux, but recording on Linux or Windows has had far less use. Reports are welcome.

**Playwright MCP.** Add it to Claude Code (user scope), using real Chrome:

```bash
claude mcp add playwright --scope user -- npx -y @playwright/mcp@0.0.84 --browser chrome
```

or in your MCP config:

```json
{ "mcpServers": { "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@0.0.84", "--browser", "chrome"] } } }
```

**Getting Claude into your product.** Use a sandbox or test account, and pick one of two ways:

1. **Log in yourself.** Claude opens the login page in the browser the Playwright MCP opens (not
   your everyday Chrome) and you log in there. If you use your own Playwright MCP profile,
   remember it is logged in as you.
2. **Hand over demo credentials.** Claude logs in for you, before recording starts, so the login
   is never filmed. The safest way keeps the password out of the chat: store it in macOS Keychain
   yourself, in a Terminal window (it prompts for the password and does not echo it), then tell Claude the item name:
   ```bash
   security add-generic-password -s demo-acme -a 'demo@example.com' -w
   ```
   Claude reads it only to log in, never repeats it, and writes it to no file (a gitignored
   `app/.env` only if you ask for one). If the site asks for a 2FA code, Claude asks you for it at
   that moment. It refuses credentials for an account with real customer data unless you confirm
   it is a test account.

After that Claude runs every stage to the end without asking and shows you the results.

Working on the plugin itself? Clone the repo, run `npm install` there, and start Claude Code with
`claude --plugin-dir /path/to/demo-studio`.

## Install

You need macOS (Linux works with less testing), Claude Code, and a sandbox account for the product
you want to film.

**1. Install the plugin** in Claude Code:

```
/plugin marketplace add Cyvid7-Darus10/demo-studio
/plugin install demo-studio@demo-studio
```

**2. Set up once** in a terminal (Homebrew shown; see [Requirements](#requirements) for others):

```bash
brew install node ffmpeg python && brew install --cask google-chrome
claude mcp add playwright --scope user -- npx -y @playwright/mcp@0.0.84 --browser chrome
P="$(ls -d ~/.claude/plugins/cache/demo-studio/demo-studio/*/ | tail -1)"
npm install --prefix "$P" && bash "$P/scripts/doctor.sh"
```

`doctor.sh` checks everything and prints the exact fix for anything missing.

**3. Ask Claude.** Start Claude Code in a folder for your demos (`mkdir -p ~/demos && cd ~/demos && claude`)
and say what you want:

> Make a demo of app.example.com. Goal: a new user creates a project and invites a teammate.
> Audience: small team leads. I'm logged in to the sandbox in the Playwright browser.

or, handing over the account:

> Make a demo of app.example.com. Goal: a new user creates a project and invites a teammate.
> The sandbox login is demo@example.com; the password is in Keychain as demo-acme.

**What you get:** one report at the end with a written plan, a clean 1080p take per scene, a
review reel, a keynote-style cut with captions and zooms, and a narrated version. Ask for promo and
how-to cuts, 4:5 and 9:16 social versions and a zip for a human editor too. Claude stops early only
for a login or 2FA code, a step that would cost money or create something that cannot be deleted,
or deleting your data. Want to check the plan or the reel first? Say so, and it stops there.
Want to see it work first? Do the [first demo in 10 minutes](#first-demo-in-10-minutes).

## First demo in 10 minutes

No account or login needed. This records and cuts [examples/todo-sample](../examples/todo-sample), a
public todo app, so you see the whole pipeline once. After the setup above, start Claude Code in an
empty folder and say:

> Try demo-studio on the todo sample.

Claude then:

1. Copies the sample into `demos/todo-sample/` (its plan and three scene scripts are already written).
2. Starts the recorder and opens the todo app in the Playwright browser at 2x.
3. Records the three scenes, checks each one on a contact sheet, and encodes the takes.
4. Shows you the review reel, then builds the keynote cut with captions, cards and zooms.
5. Narrates it with macOS `say` (or your own voice or ElevenLabs, if set up) and opens
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
| `AGENTS.md` | The playbook Claude reads first: modes, how much to ask, stage gates, house rules, folder layout. Edit it to fit your team; it wins over the plugin's defaults |
| `CLAUDE.md` | Points Claude at the playbook and the session routine |
| `README.md` | The index: one row per demo with its status and final cut |
| `check.py` | A drift report: index rows that point nowhere, takes nobody reviewed, throwaways never deleted, leftover frames, stray secrets files, low disk |
| `.gitignore` | Keeps recordings, zips, voice caches, browser profiles and `.env` files out of git |

Each demo then gets its own folder from `new-demo.sh` (Claude runs it): brief, run sheet, shot list,
voiceover draft, prep checklist, throwaways list, `demo.json` and `handoff.json`.
