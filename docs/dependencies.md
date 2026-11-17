# Dependencies

[Back to the README](../README.md)

Everything demo-studio needs is free and runs on your machine. `bash scripts/doctor.sh` checks
each item below and prints the exact fix for anything missing.

## System tools

| Tool | Version | Why | Required | Licence |
| --- | --- | --- | --- | --- |
| Claude Code | current | Runs the skills | yes | Anthropic terms |
| Node.js | 20+ (22 LTS recommended) | Recorder, frame receiver, card and look rendering, the local studio | yes | MIT |
| Python | 3.10+, standard library only (no pip packages) | Edit, narration, handoff and check scripts | yes | PSF |
| ffmpeg with libx264 | any recent build | All encoding, mixing and loudness measurement | yes | LGPL/GPL (your own install) |
| Google Chrome | current stable | The recorded browser and the headless renderer for titles and overlays | yes | Google terms |
| Playwright MCP | `@playwright/mcp@0.0.84` (pinned) | Lets Claude drive the logged-in browser | yes, for recording | Apache-2.0 |
| macOS `say` | built into macOS | Free placeholder narration and timing previews | optional | Apple |
| 10 GB free disk | | Raw frames take several GB per demo until encoded | yes, to record | |

## npm packages

Installed with `npm install` in the repo (or the plugin folder). All versions are pinned exactly and
locked in `package-lock.json`. `npm audit --omit=dev` reports no known vulnerabilities in the runtime
packages. The dev and build tools (Vite, Vitest) currently carry one advisory through `picomatch`
(a ReDoS in glob matching, GHSA-fc5q-39xc-vjpf) with no fixed release yet; it only affects running
the tests or the dev server on your own files.

| Package | Version | Used for | Kind | Licence |
| --- | --- | --- | --- | --- |
| playwright-core | 1.56.1 | Recording, scouting, headless rendering of cards and overlays | runtime | Apache-2.0 |
| react, react-dom | 18.3.1 | The local studio UI | runtime (studio) | MIT |
| ajv | 8.20.0 | Validating `demo.json`, `handoff.json` and templates against their schemas | runtime (studio) | MIT |
| lucide-react | 0.468.0 | Icons in the studio | runtime (studio) | ISC |
| vite | 6.4.5 | Builds the studio UI on first run | build | MIT |
| @vitejs/plugin-react | 4.3.4 | Vite React support | build | MIT |
| typescript | 5.7.2 | Type checking the studio | dev | Apache-2.0 |
| vitest | 4.1.12 | Studio unit tests | dev | MIT |
| @types/node, @types/react, @types/react-dom | pinned | Type definitions | dev | MIT |

The studio's server uses only Node's built-in modules (no web framework, no database).

## Bundled assets

| Asset | Version | Where | Licence |
| --- | --- | --- | --- |
| Inter and Inter Display | 4.1 | `assets/fonts/` (titles, captions, pills, end cards) | SIL OFL 1.1 |
| Geist and Geist Mono | 1.9.0 | `assets/fonts/` (alternative look) and `app/src/fonts/` (studio UI) | SIL OFL 1.1 |

Download sources and SHA-256 checksums are in `assets/fonts/README.md`; credits are in `NOTICE`.

## Optional services (only if you choose them)

| Service | Used for | How it connects | Cost |
| --- | --- | --- | --- |
| ElevenLabs | Narration voice and music beds | `ELEVENLABS_API_KEY` from your shell or macOS Keychain, or the ElevenLabs MCP | Paid plan or free credits |
| Higgsfield | Narration and music | Its MCP only (it has no documented speech API) | Paid credits |

Nothing else leaves your machine: no account, no telemetry, no analytics. Claude Code itself talks
to Anthropic's model as usual (see the [FAQ](faq.md#is-anything-sent-to-the-cloud)).
