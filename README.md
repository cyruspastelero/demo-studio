# demo-studio

[![CI](https://github.com/Cyvid7-Darus10/demo-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/Cyvid7-Darus10/demo-studio/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A Claude Code plugin for product demo videos. Tell Claude the goal, then either log in to your
site in the Playwright browser or hand over your demo credentials. The agent does the rest: it plans
the story, tests the flow, records the real product, cuts and narrates the video, and packages a
handoff for an editor. It asks nothing more unless it needs a login code, or a step would cost money
or create something that cannot be deleted.

- **Real footage.** Every frame is your product running. Nothing on screen is AI-generated.
- **Local and free.** Everything runs on your machine: no account, no cloud service, no telemetry.
  The tools are free (Playwright, Chrome, ffmpeg, Python, Node), and so is narration with macOS
  `say` or your own voice. Paid services such as ElevenLabs or Higgsfield for voice and music are
  used only if you choose them. Claude Code itself talks to Anthropic as usual.
- **Safe by design.** Sandbox or test accounts only, logged in before recording starts. Secrets are
  masked in the page before a frame is captured, and credentials are never written to the repo.
  The editor listens on 127.0.0.1 only, and demo folders from other people are treated as
  untrusted (paths stay inside the demo folder, title cards render sandboxed). See [SECURITY.md](SECURITY.md).
- **Looks professional by default.** Every cut is built to a [measured quality bar](docs/quality-bar.md): a cropped floating window on a soft pastel background, whole-window zooms, highlight boxes, callout pills, word-by-word titles in bundled Inter, an end card and logo outro, and a mix at -14 LUFS. `check-cut.py` proves it.

## Sample videos

Both were recorded from the real app and finished entirely by the plugin: crops, zooms, highlights,
callouts, titles, ElevenLabs narration and music. Click a preview for the full 1080p video with sound.

| Study app showcase (1:18) | Todo app sample (0:37) |
| --- | --- |
| [![Study app showcase](docs/img/sample-showcase.gif)](https://github.com/Cyvid7-Darus10/demo-studio/releases/download/samples/sample-showcase.mp4) | [![Todo app sample](docs/img/sample-todo.gif)](https://github.com/Cyvid7-Darus10/demo-studio/releases/download/samples/sample-todo.mp4) |
| A live web app with a seeded demo learner: dashboard, weak topics, a question with its explanation, a story, a scenario and readiness. Highlights take the product's own colour. | A public todo app ([TodoMVC](https://todomvc.com)), three scenes, no login. Its plan, scene scripts, takes and configs are in [examples/todo-sample](examples/todo-sample), so you can rebuild it yourself. |

## Quick start

Clone the repo and work inside it. Your demos live in `demos/` in the clone, which git ignores.

```bash
brew install node ffmpeg python && brew install --cask google-chrome   # other systems: docs/getting-started.md
claude mcp add playwright --scope user -- npx -y @playwright/mcp@0.0.84 --browser chrome
git clone https://github.com/Cyvid7-Darus10/demo-studio.git && cd demo-studio
npm install && bash scripts/doctor.sh && bash scripts/new-workspace.sh ./demos
claude
```

Prefer it as a plugin in any folder? `/plugin marketplace add Cyvid7-Darus10/demo-studio`, then
`/plugin install demo-studio@demo-studio` ([details](docs/getting-started.md#install)).

Then ask:

> Make a demo of app.example.com. Goal: a new user creates a project and invites a teammate.
> I'm logged in to the sandbox in the Playwright browser.

Or hand over a demo account instead, and Claude logs in itself (off camera, password kept in your
macOS Keychain, never in a file): "The sandbox login is demo@example.com, the password is in
Keychain as demo-acme." See [Do I have to give Claude my password?](docs/faq.md#do-i-have-to-give-claude-my-password)

New here? Say **"try it"** and Claude records the [todo sample](examples/todo-sample) end to end,
no login needed ([10 minute walkthrough](docs/getting-started.md#first-demo-in-10-minutes)).

## What you get

One report at the end with a written plan, a clean 1080p take per scene, a review reel, a
keynote-style cut built to the quality bar, and a narrated version. Ask for promo and how-to cuts,
4:5 and 9:16 social versions and a zip for a human editor too. Want to check the plan or the reel
before Claude goes on? Say so, and it stops there.

## Docs

| Page | What is in it |
| --- | --- |
| [Getting started](docs/getting-started.md) | Requirements, install, the first demo, the starter kit for a demos folder |
| [How it works](docs/how-it-works.md) | Stages, deliverables, quality gates, narration and music |
| [Studio](docs/studio.md) | The local dashboard and the editor |
| [Style guide](references/style-guide.md) | The house look: pointer, typing, pacing, zooms, callouts, voice |
| [Quality bar](docs/quality-bar.md) | The measured minimum every finished cut must pass, with its checklist |
| [Samples](samples/README.md) | Scene recipes and a full sample plan to copy from |
| [FAQ](docs/faq.md) | Passwords, cost, what stays local, files, timing, re-shoots, branding, safety |
| [Development](docs/development.md) | Repo layout and tests |

## Contributing

The most useful contribution is often one line in [references/learnings.md](references/learnings.md).
See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).
Plans: [docs/ROADMAP.md](docs/ROADMAP.md).

## License

Apache License 2.0. If you use or adapt this code, keep the [NOTICE](NOTICE) file, which credits
Cyrus David Pastelero. See [LICENSE](LICENSE).
