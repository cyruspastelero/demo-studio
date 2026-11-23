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

Clone the repo and work inside it. Your demos live in `demos/` in the clone, which git ignores.

```bash
brew install node ffmpeg python && brew install --cask google-chrome   # other systems: docs/getting-started.md
claude mcp add playwright --scope user -- npx -y @playwright/mcp@0.0.84 --browser chrome
git clone https://github.com/cyruspastelero/demo-studio.git && cd demo-studio
npm install && bash scripts/doctor.sh && bash scripts/new-workspace.sh ./demos
claude
```

Prefer it as a plugin in any folder? `/plugin marketplace add cyruspastelero/demo-studio`, then
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

All free and local: Claude Code, Node.js 20+, Python 3.10+, ffmpeg, Google Chrome and the
Playwright MCP. ElevenLabs or Higgsfield are optional, for voice and music. Versions, packages,
fonts and licences: [docs/dependencies.md](docs/dependencies.md).

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
