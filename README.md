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
4. It tests the flow, records the product, then cuts and narrates the video.

After you approve the plan, it only stops to ask for a login code, or before a step that would cost
money or create something it can't delete.

- **Real footage.** Every frame is your product running. Nothing is AI-generated.
- **Local and free.** It runs on your machine with free tools. Paid voices and music are optional.
- **Safe.** Test accounts only, and secrets are masked before anything is captured.
  [More](#local-and-safe)
- **Polished by default.** Every cut meets a [measured quality bar](docs/quality-bar.md), and
  `check-cut.py` checks it.

## Sample videos

Real apps, finished by the plugin. Click a preview to watch it in 1080p with sound.

| Study app showcase (1:18) | Todo app sample (0:37) |
| --- | --- |
| [![Study app showcase](docs/img/sample-showcase.gif)](https://github.com/cyruspastelero/demo-studio/releases/download/samples/sample-showcase.mp4) | [![Todo app sample](docs/img/sample-todo.gif)](https://github.com/cyruspastelero/demo-studio/releases/download/samples/sample-todo.mp4) |
| A live study app with a seeded demo learner. | [TodoMVC](https://todomvc.com), three scenes, no login. [Rebuild it yourself](examples/todo-sample). |

**Launch videos**, also made with demo-studio:

| demo-studio launch ad (0:36) | demo-studio walkthrough (1:10) | Switchyard launch ad (0:36) |
| --- | --- | --- |
| [![demo-studio launch ad](docs/img/sample-launch-ad.gif)](https://github.com/cyruspastelero/demo-studio/releases/download/samples/sample-launch-ad.mp4) | [![demo-studio walkthrough](docs/img/sample-launch-poster.jpg)](https://github.com/cyruspastelero/demo-studio/releases/download/samples/sample-launch.mp4) | [![Switchyard launch ad](docs/img/sample-daylight-ad.gif)](https://github.com/cyruspastelero/demo-studio/releases/download/samples/sample-daylight-ad.mp4) |
| `airy` style. [Files](examples/launch-ad) | Narrated. [Files](examples/demo-studio-launch) | `daylight` style, for [Switchyard](https://github.com/cyruspastelero/switchyard). [Files](examples/switchyard-launch) |

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

- **Every demo:** the written plan, a clean 1080p take per scene, a review reel, the finished video and
  a narrated version.
- **When you ask:** promo and how-to cuts, 4:5 and 9:16 social versions, and a package for a video
  editor.
- **An editor to fix things yourself:** `npm run studio` opens it. Play the cut, retime shots, move and
  edit text on the video, and rewrite a voiceover line to see if it still fits.
  [Try it in the browser](https://cyruspastelero.github.io/demo-studio/#editor).

<p align="center">
  <img src="docs/img/editor.gif" alt="The editor on the todo sample: playing the cut, selecting a scene and adding words to its voiceover while the fit readout updates" width="860">
</p>

## Sound

Voiceover lines are written with the plan and checked to fit their scene before any voice is made.
Music sits under the voice, and the mix lands at -14 LUFS, all with ffmpeg on your machine.

| Voice | Cost |
| --- | --- |
| macOS `say` (the default) | Free |
| Your own recordings in `voiceover/` | Free |
| ElevenLabs (API key or MCP) | Your plan; re-runs are cached |
| Higgsfield (MCP) | Your credits |

Music is your own licensed track, or one made with ElevenLabs or Higgsfield.
More in [How it works](docs/how-it-works.md).

## Local and safe

- Your demos stay in `demos/` on your disk. No account, no telemetry.
- Test accounts only. Secrets are masked in the page before anything is captured, and credentials are
  never written to the repo.
- The studio only listens on your own machine.
- Paid voice services see your voiceover text only if you choose them.

Claude Code itself still talks to Anthropic. Limits and reporting: [SECURITY.md](SECURITY.md).

## Look templates

- **Demo video looks:** `house` (the default), `midnight`, `paper` and `mono`. Name one in demo.json
  (`"template": "paper"`), or Claude picks one that suits the product and tells you which.
- **Copy a look you like:** say "copy the look of launch.mp4" and Claude saves it as a new template.
- **Launch-ad styles:** `airy`, `daylight`, `nocturne` and `showroom` make short, music-driven ads from
  the demo's real footage, in 16:9, 4:5 and 9:16.

Your brand colours and logo always win. The studio's Templates page shows every look and style with
preview frames. More in [Look templates](docs/templates.md) and [Launch ads](docs/motion.md).

## Dependencies

All free, all on your machine. `bash scripts/doctor.sh` checks each one and prints the fix.

| You need | For |
| --- | --- |
| Claude Code (or another agent with MCP) | Running the skills that plan, record and edit |
| Playwright MCP | Clicking and typing in your logged-in browser |
| Google Chrome | The recorded browser, and drawing titles and text |
| Node.js 20+ | Recording, overlays and the studio app |
| Python 3.10+ | Cutting, narration and checks (no pip packages) |
| ffmpeg | Video, sound and loudness |

Other agents (Codex, Cursor, Gemini CLI) can follow `skills/demo-studio/SKILL.md`. Versions and
licences: [docs/dependencies.md](docs/dependencies.md).

## Docs

| Page | Read it for |
| --- | --- |
| [Getting started](docs/getting-started.md) | Install and your first demo |
| [How it works](docs/how-it-works.md) | The stages and what you get |
| [Studio](docs/studio.md) | The dashboard and the editor |
| [Look templates](docs/templates.md) | The looks, and copying one from a video |
| [Launch ads](docs/motion.md) | Music-driven ads and their styles |
| [Quality bar](docs/quality-bar.md) | What every finished cut must pass |
| [Style guide](references/style-guide.md) | Pointer, typing, pacing, zooms and voice |
| [Samples](samples/README.md) | Scene recipes to copy |
| [FAQ](docs/faq.md) | Passwords, cost, safety and more |
| [Dependencies](docs/dependencies.md) | Every tool, with versions and licences |
| [Development](docs/development.md) | Repo layout and tests |

## Contributing

The most useful contribution is often one line in [references/learnings.md](references/learnings.md).
See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).
Plans: [docs/ROADMAP.md](docs/ROADMAP.md).

## License

Apache License 2.0. If you use or adapt this code, keep the [NOTICE](NOTICE) file, which credits
Cyrus David Pastelero. See [LICENSE](LICENSE).
