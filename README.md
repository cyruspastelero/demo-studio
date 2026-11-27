<p align="center">
  <img src="assets/logo/mark.svg" alt="" width="64" height="64">
</p>

<h1 align="center">demo-studio</h1>

<p align="center">
  <b>Tell Claude the goal. Get a finished demo video of your real app.</b>
</p>

<p align="center">
  <a href="https://github.com/cyruspastelero/demo-studio/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/cyruspastelero/demo-studio/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-d2430e"></a>
  <img alt="Free and local" src="https://img.shields.io/badge/runs-locally-171717">
</p>

<p align="center">
  <a href="https://cyruspastelero.github.io/demo-studio/"><b>Live demo</b></a>
  &nbsp;·&nbsp;
  <a href="#quick-start"><b>Quick start</b></a>
  &nbsp;·&nbsp;
  <a href="#docs"><b>Docs</b></a>
</p>

A Claude Code plugin that turns your real product into a finished demo video.

**How it works**

1. Tell Claude what the video should show.
2. Log in to a test account in the Playwright browser, or hand over demo credentials.
3. Claude writes the plan and shows it to you. Nothing is recorded until you say go.
4. It tests the flow, records the product, then cuts and narrates the video. It also packages a
   handoff for a video editor.

After you approve the plan, it only stops to ask for a login code, or before a step that would cost
money or create something it can't delete.

- **Real footage.** Every frame is your product running. Nothing is AI-generated.
- **Local and free.** It runs on your machine with free tools, and there's no account or telemetry
  (Claude Code itself still talks to Anthropic). Paid voices and music (ElevenLabs, Higgsfield) are
  optional.
- **Safe.** It uses test accounts only, masks secrets before a frame is captured, and never writes
  credentials to the repo. See [SECURITY.md](SECURITY.md).
- **Polished by default.** Every cut meets a [measured quality bar](docs/quality-bar.md), and
  `check-cut.py` checks it.

## Sample videos

These two were recorded from real apps and finished entirely by the plugin: crops, zooms, highlights,
callouts, titles, ElevenLabs narration and music. Click a preview for the full 1080p video with sound.

| Study app showcase (1:18) | Todo app sample (0:37) |
| --- | --- |
| [![Study app showcase](docs/img/sample-showcase.gif)](https://github.com/cyruspastelero/demo-studio/releases/download/samples/sample-showcase.mp4) | [![Todo app sample](docs/img/sample-todo.gif)](https://github.com/cyruspastelero/demo-studio/releases/download/samples/sample-todo.mp4) |
| A live web app with a seeded demo learner: dashboard, weak topics, a question with its explanation, a story, a scenario and readiness. Highlights take the product's own colour. | A public todo app ([TodoMVC](https://todomvc.com)), three scenes, no login. Its plan, scene scripts, takes and configs are in [examples/todo-sample](examples/todo-sample), so you can rebuild it yourself. |

demo-studio's own launch videos were made with it too, from one plan. Both are in `examples/` to copy.

| Launch ad (0:36) | Narrated walkthrough (1:10) |
| --- | --- |
| [![demo-studio launch ad](docs/img/sample-launch-ad.gif)](https://github.com/cyruspastelero/demo-studio/releases/download/samples/sample-launch-ad.mp4) | [![demo-studio walkthrough](docs/img/sample-launch-poster.jpg)](https://github.com/cyruspastelero/demo-studio/releases/download/samples/sample-launch.mp4) |
| A beat-synced motion-graphics ad in the `airy` style, from real screens of the site and the editor. Storyboard and media: [examples/launch-ad](examples/launch-ad). | The keynote cut with narration: the site, the live editor, the repo and the samples. Plan and scene scripts: [examples/demo-studio-launch](examples/demo-studio-launch). |

A launch ad in the `daylight` template for [Switchyard](https://github.com/cyruspastelero/switchyard),
an open-source macOS app: typed headlines, one button lifted out of the UI, a shape sweep and a sharp
zoom into a close-up take.

| Switchyard launch ad (0:36) |
| --- |
| [![Switchyard launch ad in the daylight template](docs/img/sample-daylight-ad.gif)](https://github.com/cyruspastelero/demo-studio/releases/download/samples/sample-daylight-ad.mp4) |
| Storyboard and media: [examples/switchyard-launch](examples/switchyard-launch). Template: [motion-templates/daylight](motion-templates/daylight). |

## Quick start

**1. Install the tools** (macOS; for Linux and Windows see [getting started](docs/getting-started.md)):

```bash
brew install node ffmpeg python
brew install --cask google-chrome
```

**2. Give Claude a browser it can drive:**

```bash
claude mcp add playwright --scope user -- npx -y @playwright/mcp@0.0.84 --browser chrome
```

**3. Get demo-studio and check your setup:**

```bash
git clone https://github.com/cyruspastelero/demo-studio.git
cd demo-studio
npm install
bash scripts/doctor.sh
```

`doctor.sh` lists anything missing, with the command that fixes it.

**4. Make a folder for your demos and start Claude:**

```bash
bash scripts/new-workspace.sh ./demos
claude
```

Your demos live in `demos/`, which git ignores.

**5. Ask for a demo.** Log in to a test account in the Playwright browser, then say:

> Make a demo of app.example.com. Goal: a new user creates a project and invites a teammate.
> I'm logged in to the sandbox in the Playwright browser.

Rather not log in yourself? Give Claude a demo account and it logs in off camera. The password stays
in your macOS Keychain, never in a file:

> The sandbox login is demo@example.com, the password is in Keychain as demo-acme.

More in [Do I have to give Claude my password?](docs/faq.md#do-i-have-to-give-claude-my-password)

**Just want to see it work?** Say **"try it"**. Claude records the [todo sample](examples/todo-sample)
end to end, no login needed ([10-minute walkthrough](docs/getting-started.md#first-demo-in-10-minutes)).

**Prefer the plugin in any folder?** Inside Claude Code, run
`/plugin marketplace add cyruspastelero/demo-studio`, then `/plugin install demo-studio@demo-studio`
([details](docs/getting-started.md#install)).

## What you get

One report at the end with a written plan, a clean 1080p take per scene, a review reel, a
keynote-style cut built to the quality bar, and a narrated version. Ask for promo and how-to cuts,
4:5 and 9:16 social versions and a zip for a human editor too. Want to check the plan or the reel
before Claude goes on? Say so, and it stops there.

To fix a cut yourself, `npm run studio` opens a local timeline editor: play and scrub the cut,
retime shots, rewrite a voiceover line and see at once whether it still fits.
[Try it in the browser](https://cyruspastelero.github.io/demo-studio/#editor) on the todo sample first.

<p align="center">
  <img src="docs/img/editor.gif" alt="The editor on the todo sample: playing the cut, selecting a scene and adding words to its voiceover while the fit readout updates" width="860">
</p>

## Sound

Each shot's `voiceover` line is written with the plan. `narrate.py` checks every line fits its
slot (about 2.5 words a second) before any voice is made, renders and places each line, loops a
music bed 13 dB under the voice and 7 dB lower under each line, and mixes to -14 LUFS with true
peak under -1 dBTP, all with ffmpeg on your machine.

| Voice | Cost |
| --- | --- |
| macOS `say`, the default | Free |
| Your own recordings in `voiceover/` | Free |
| ElevenLabs, by API key (read from your shell or Keychain) or MCP | Your plan, cached so re-runs cost nothing |
| Higgsfield, by MCP | Your credits |

Music is your own licensed track or one made with ElevenLabs or Higgsfield. Details:
[How it works](docs/how-it-works.md).

## Local and safe

No account, no cloud service, no telemetry. Demos stay in `demos/` on your disk. Recording uses
sandbox logins only, secrets are masked in the page before capture, the editor listens on
127.0.0.1, and paid voice services see your voiceover text only if you pick them. Claude Code
itself talks to Anthropic as usual. Limits and reporting: [SECURITY.md](SECURITY.md).

## Look templates

The look of a cut (window, zooms, highlights, callouts, titles, ending, loudness) is a template, so
the setup grows with you:

- **Pick one per demo** with one line in demo.json: `"template": "house"`. Your brand colours and
  logo still win, so one template serves every product.
- **Copy the look of any video.** Say "copy the look of launch.mp4" and skill `demo-template`
  measures it frame by frame and saves a new template with previews.
- **Share it as a folder** in `_templates/`. A template with a built-in's name replaces it.

Details: [docs/templates.md](docs/templates.md).

**Launch ads.** For a short, music-driven ad instead of a walkthrough, skill `demo-motion` turns the
demo's real stills and clips into a beat-synced motion-graphics ad: kinetic type, tilted UI panels,
a typed prompt, progress tiles, a Done burst and a logo lock-up, in 16:9, 4:5 and 9:16. Three
measured motion templates (`airy`, `nocturne`, `showroom`) set the look; your brand colour and logo
still win. The demo-studio launch ad in `examples/launch-ad/` is one storyboard. Details:
[docs/motion.md](docs/motion.md).

## Dependencies

All free, all on your machine. `bash scripts/doctor.sh` checks each one and prints the fix.

| You need | What it does |
| --- | --- |
| A coding agent with MCP | Follows the skills in `skills/` that plan, record and edit. Claude Code loads them on its own and is what we test with. Other agents (Codex, Cursor, Gemini CLI) can follow them: point them at `skills/demo-studio/SKILL.md` |
| Playwright MCP | Lets the agent click and type in your logged-in browser |
| Google Chrome | The browser that gets recorded, and the renderer for titles |
| Node.js 20+ | Records takes, renders overlays, runs the studio app |
| Python 3.10+ | Cuts, narration, checks and the editor handoff (no pip packages) |
| ffmpeg | Encodes video, mixes sound, measures loudness |

`npm install` adds `playwright-core` (recording) and React with Vite (the studio app).
Optional: macOS `say` for a free draft voice; ElevenLabs or Higgsfield for paid voice and music,
used only when you ask. Versions and licences: [docs/dependencies.md](docs/dependencies.md).

## Docs

| Page | What is in it |
| --- | --- |
| [Getting started](docs/getting-started.md) | Requirements, install, the first demo, the starter kit for a demos folder |
| [How it works](docs/how-it-works.md) | Stages, deliverables, quality gates, narration and music |
| [Studio](docs/studio.md) | The local dashboard and the editor |
| [Style guide](references/style-guide.md) | The house look: pointer, typing, pacing, zooms, callouts, voice |
| [Quality bar](docs/quality-bar.md) | The measured minimum every finished cut must pass, with its checklist |
| [Look templates](docs/templates.md) | Reusable looks: the built-ins, copying the look of a video, using and sharing a template |
| [Launch ads](docs/motion.md) | Storyboard to beat-synced motion-graphics ad: scene types, motion templates, rendering, music |
| [Samples](samples/README.md) | Scene recipes and a full sample plan to copy from |
| [FAQ](docs/faq.md) | Passwords, cost, what stays local, files, timing, re-shoots, branding, safety |
| [Dependencies](docs/dependencies.md) | Every tool, package and font, with versions and licences |
| [Development](docs/development.md) | Repo layout and tests |

## Contributing

The most useful contribution is often one line in [references/learnings.md](references/learnings.md).
See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).
Plans: [docs/ROADMAP.md](docs/ROADMAP.md).

## License

Apache License 2.0. If you use or adapt this code, keep the [NOTICE](NOTICE) file, which credits
Cyrus David Pastelero. See [LICENSE](LICENSE).
