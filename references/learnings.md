# Learnings from real shoots

Hard-won gotchas. Read before the first take, and re-check when something breaks. Every line
here cost at least one re-shoot.

## Capture quality

- **Never use `page.screenshot()` loops or Playwright's video option.** Screenshots top out at
  10-24fps and look choppy; Playwright video is low bitrate and blurry. Use CDP
  `Page.startScreencast` (via `record()`), which delivers about 60fps of JPEG frames that the
  receiver caps at 30.
- **Record at DPR 2.** The MCP's default context is DPR 1, so 1920 px of UI downscaled looks soft.
  `mk-setup.sh` clones the logged-in session into a second context at 1440x810 CSS and DPR 2, giving
  2880x1620 frames that are downscaled with lanczos to 1920x1080. A 1440 CSS viewport also makes UI
  text large enough to read at 1080p. A 1920 CSS viewport made the UI too small.
- **Frames arrive with timestamps, not at a fixed rate.** Screencast only emits on repaint, so the
  encoder holds each frame until the next timestamp and holds the last one until `end.txt`.
  Frames can arrive out of order; the encoder sorts them.
- **Tab switches reset the viewport** (a take came out at 1536x857 with the side pane cut off).
  `record()` refuses to start unless the viewport is exactly 1440x810 at DPR 2, and `prep(p)` resets it.
  Always `prep(p)` right before `record()`.
- **Constantly repainting pages (terminals, consoles, video) flood the disk.** The receiver caps
  30fps and 5400 frames per take (3 min), and it refuses to start below 4 GB free. A 60s take is
  about 0.5-1 GB of JPEGs, so delete `recordings/frames/` once takes are approved.

## Secrets (the non-negotiable part)

See `secrets.md` for the full rules. In short: mask in the page, not in post; add the product's
token shapes and labels to `_project.js` before the first take; verify every frame across a
reveal; sandbox accounts only; list everything created on camera in THROWAWAYS.md.

## Playwright MCP sandbox

- The tool is `browser_run_code` in older Playwright MCP versions and `browser_run_code_unsafe` in
  newer ones. They take the same `filename`.
- `browser_run_code` only loads `filename` scripts from `<session cwd>/.playwright-mcp/`, so
  export `PLAYWRIGHT_MCP_OUT` to that path and let `mk-scene.sh` write there. Start Claude Code in
  the folder that holds your demos so the path is predictable.
- **File uploads need the media under the session cwd too.** Copy the file into the demo folder
  first; paths outside the cwd are refused.
- **The MCP intercepts file choosers.** Click the upload button in the scene, let the run end, then
  call `browser_file_upload` with the file. Do not try `setInputFiles` on a chooser the MCP owns.
- Nothing persists between run_code calls (functions, variables). That is why `mk-scene.sh` inlines
  `_project.js` + `lib.js` into every scene. Objects on `ctx` (like `ctx._demoInit`) do persist.
- **Keep run_code payloads small.** Inlining lib.js into every scene makes each call large. Install
  the helpers once per context with `mk-lib.sh` (stores them on `ctx._L`) and wrap scenes with
  `mk-scene.sh <name> --use-lib`. Re-run `_lib.run.js` after every `_setup.run.js`.
- No `require` or `import`. Talk to the local receiver with `ctx.request` (the `api` helper).
- Pages from `setContent` cannot load `file://`, so embed images as base64 data URIs.
- If `page.context().browser()` is null, the MCP runs a persistent context and a second context
  cannot be created. The user must restart the MCP (for example `--isolated` with storage state, or
  connect over CDP).
- **Put font lists in a `<style>` block with single quotes.** Double quotes inside a `style="..."`
  attribute break the font list and the page silently falls back to Times.

## Making it look human

- Always `glide()` the pointer to a target, pause about 300-600ms, then `tap()`. Never teleport-click.
- **The cursor is the normal arrow** (the default). A blue click dot reads as a screen recorder, not
  a person. `PROJECT.cursor = 'hand'` gives a pointing hand whose fingertip is the hotspot, for
  consumer apps.
- **Moves are eased on a slight arc** by `moveHuman` (used by `glide`, `click` and `park`). A straight
  constant-speed `p.mouse.move(..., { steps })` looks robotic, so do not call it on camera. Use
  `placeCursor(p)` to put the pointer at its resting spot before `record()` starts.
- Type with `typeHuman` (45-75ms per key). For long text (manifests, code), paste instead of typing.
  Nobody wants 40s of typing.
- **Check focus before typing in web composers.** Rich text composers (chat apps, AI chat boxes) lose
  focus after a popover or a send. Click the composer, then confirm `document.activeElement` is inside
  it before `typeHuman`, or the keystrokes go to page shortcuts.
- After an action, `park()` the pointer away from the text the viewer should read.
- Start each take with 1-1.5s of stillness and end with 2-3s of hold. Editors need handles.
- Hide clutter first: notification banners, "enable notifications", cookie bars, unread pills,
  onboarding tours (`PROJECT.clutter`). Close stray popovers before recording.
- **Clutter patterns must be specific.** Each entry is a regex tested against an element's text, so a
  short or empty one hides real UI. Use the banner's full wording.
- **Transient toasts are clutter too.** "Saved", "Syncing", "Copied" notices that flash on every
  action distract on video. Add their text to `PROJECT.clutter`.
- Wait on real UI signals (`locator.waitFor`) instead of fixed sleeps for async results (bot replies,
  API calls). Log the latency in the scene's return value. It is useful for captions and trims.

## Story, data and state

- **One consistent world.** Same workspace, channel, customer and record naming across all scenes.
  Re-shoot the whole "use" sequence in one pass so ids and numbers line up (invoice 0006 appears in
  the chat, the payment page and the dashboard).
- **Seed a dedicated demo user with realistic mock data** instead of filming a real or personal
  account. Write an idempotent seed script that touches only that user's rows, and make the numbers
  agree with the app's own formulas so the dashboard, analytics and detail pages match each other.
- **After re-seeding, re-shoot every scene that shows the changed data.** Mark scene dependencies in
  the shot list ("Depends on") so you know which ones.
- **Reset scripts between takes.** Anything a take changes (a submitted form, a started session, an
  approved request) needs a reset script so the next take starts from the same state.
- **A local helper server makes on-camera actions deterministic.** When the app picks content at
  random (quiz questions, recommendations), run a small localhost server that returns the right
  answer for what is on screen, and have the scene ask it before clicking. Bind to 127.0.0.1 only and
  keep it out of the frame.
- **Record in a timezone where time-sensitive UI looks right.** Deadlines, "only 7h left today"
  warnings, greetings and dates depend on the clock. Set `DEMO_TIMEZONE` (and `DEMO_LOCALE`) for
  `mk-setup.sh`, or `browser.timezone` in demo.json for `rec.mjs`, before the first take.
- Show the setup honestly: where the user finds it, the install, creating each credential with
  least-privilege scopes, where the secrets go, pressing Run. Viewers flagged cuts that skipped
  "how did it get there".
- Create things on camera, then delete them afterwards (THROWAWAYS.md), rather than faking the steps.
- **Run only one instance of any bot or service.** Two instances on one token caused "draft expired"
  style failures mid-take.
- Background agents (for example a hosted IDE's assistant auto-starting on import) can change code.
  Stop them and diff before continuing.
- Before the use scenes, run the full flow once off camera (a smoke take) to warm caches and catch
  data bugs. Example: a customer nickname showed a raw id on the hosted page and needed a code fix.
- **Multi-person demos need separate windows.** Open one Chrome window per person with
  `open-window.sh` (its own profile and debugging port), list them under `windows` in demo.json, and
  record with `rec.mjs <window>`. Give each window its own `rx_port` to record two at once.

## Working from a client brief

- Paste their brief verbatim into BRIEF.md and never edit their wording: scene names, on-screen text,
  voiceover lines and taglines stay exactly as sent. Put our notes and open questions beside it.
- When the footage cannot prove one of their claims, say so and propose wording; do not change it
  silently.

## Encoding and edit

- Encode raw at CRF 14, `-preset slow`, constant 30fps, yuv420p, faststart. Keep frames until
  the take is approved, because re-encodes are cheap and re-shoots are not.
- The keynote look works best when it is restrained: a light radial background, the footage in a
  1600x900 rounded window (radius 26) with a soft shadow, one short statement caption per scene,
  0.4s fades through #F3F3F6, a slow 1.05 push-in, and eased 1.5-1.75x zooms only on the hero moments.
- Some ffmpeg builds lack `drawtext`, so text is rendered to PNG in the browser (`mk-assets.py`,
  `title-cards.mjs`). Font: `system-ui` resolves to San Francisco on macOS. Verify with CDP
  `CSS.getPlatformFontsForNode` (expect `.SFNS`). Titles 600 / -0.015em, subtitles 400 #6e6e73
  / 0.004em, captions 600 44px / -0.01em, text #1d1d1f.
- Caption copy: short declarative statements, sentence case, ending in a period ("Approve. The
  invoice is sent."). No em dashes.
- zsh modifiers (`$i:l`) and `$` inside ffmpeg expressions bite in inline shell. Put anything
  non-trivial in the Python scripts.
- Use `command rm` if `rm` is aliased. Ask the user before deleting frames or recordings.
