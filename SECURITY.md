# Security

## Reporting a problem

Report security problems privately through GitHub: open the repository's Security tab and choose
"Report a vulnerability". Please do not open a public issue for them.

Include what you found, how to reproduce it, and what someone could do with it.

## Threat model

Two assumptions shape everything below:

- **Demo folders may come from other people.** A shared `handoff.json`, `demo.json`, `takes.csv`,
  logo or voiceover folder is untrusted input, and so is everything else in the folder: the build
  sidecars in `recordings/exports/` (`*.plan.json`, `*.timing.json`, `*.voice.json`), raw takes and
  other media, folder names, and look templates someone shared.
- **Any website open in your browser can send requests to `127.0.0.1`.** Local servers must not
  trust a request just because it arrived on the loopback address.

## What demo-studio is designed to prevent

- **A secret appearing in footage.** Token-shaped text and labelled fields are blurred in the page
  as they render, before a frame is captured, and every reveal is checked frame by frame. The rules
  are in [references/secrets.md](references/secrets.md).
- **Secrets written to disk.** Skills and templates keep secrets out of every file except a demo's
  gitignored `app/.env`. The starter `check.py` reports `.env` files anywhere else.
- **Config paths reaching outside the demo folder.** Every path read from `handoff.json`,
  `demo.json` or `takes.csv` (raw and output folders, title cards, logos, headshots, callout
  avatars, the dark-outro logo, reference files, social inputs and outputs, caption images, the
  music bed, voiceover recordings) must be relative, without `..`, and must resolve (symlinks
  included) inside the demo folder. The schemas
  reject absolute and `..` paths, and the scripts check again after resolving, then stop with an
  error that names the field. Folders are only deleted when they are inside the demo's output
  folder, and never through a symlink. Paths you type on the command line (such as
  `narrate.py --music`) are yours and are not restricted.
- **Sidecars steering ffmpeg.** `narrate.py`, `check-cut.py`, `keynote-handoff.py` and
  `template-validate.py` read every sidecar through one loader that checks it against
  `schemas/sidecars.schema.json` (types, ranges, times within four hours, capped list lengths, so a
  crafted file cannot make a checker loop for ever) and checks the recorded look against the look in
  `schemas/template.schema.json`. NaN and Infinity are refused everywhere, and every number that goes
  into an ffmpeg filter graph must be a real number in its schema range and is written with fixed
  precision, never as text from the file. `check-cut.py` also checks that every time sits inside the
  cut, and reads a highlight's take only when it is relative and resolves inside the demo folder.
  Schema patterns anchor at the very end of the text, so a value with a trailing newline does not pass.
- **Takes and outputs leaving the demo folder.** Every raw take a build reads must be a regular file
  that resolves (symlinks included) inside the demo folder. Before the build makes any folder, it
  refuses a symlinked `recordings/`, and any symlink in `recordings/exports/` or
  `recordings/voice-cache/`; `narrate.py` checks the same before it writes. A template folder with a
  symlink anywhere in it is refused by `template-validate.py`, previews are written through a new
  temp file and renamed into place, and `template-from-video.py --force` refuses a target folder
  that holds a symlink. Look templates are only searched in one demos root (`$DEMO_ROOT`, or the
  demos workspace that holds the demo) and the built-ins, never in a `_templates` folder that happens
  to sit next to a downloaded demo; the build prints the `template.json` it used.
- **Temporary files used to redirect a write.** The editor's saves, the frame receiver's token file
  and the narration cache write to a temp file with a random name, created with `O_EXCL` (so it
  never follows a planted link), then rename it over the target. The frame receiver refuses a
  symlinked `frames/` or take folder and opens every frame, `blur.jsonl`, `ts.txt` and `end.txt`
  with `O_NOFOLLOW`.
- **Folder names as instructions.** A prompt the home screen offers to copy names the demo only when
  its folder name is plain (letters, digits, `.`, `_`, `-`, at most 64 characters), in backticks;
  any other name gets a generic prompt ("the demo in this folder"). Template ids are treated the
  same way.
- **Media pulling in other inputs.** Every ffmpeg and ffprobe call on media from a demo folder (the
  studio's thumbnails and durations, and the Python scripts' probes, renders and checks) runs with
  `-protocol_whitelist file,pipe`, so a crafted playlist or reference cannot make ffmpeg fetch a URL
  or open another kind of input. `doctor.sh` warns when ffmpeg is older than 6.0.
- **A shared demo spending your credits.** `narrate.py` sends text to ElevenLabs only when you pass
  `--voice elevenlabs`, or set `DEMO_STUDIO_ALLOW_CONFIG_VOICE=1` to let demo.json's
  `voice.provider` choose. Without that, a demo.json that asks for ElevenLabs, or a key in your
  environment, only gets a message, and narration uses voiceover files or the macOS voice.
- **Config values running as code.** Title-card colours and fonts must pass a strict whitelist
  (hex, `rgb()` or a colour name; a font-family list), all wording is HTML-escaped, and the card
  page renders with JavaScript off and every request blocked except inline `data:` images. The
  keynote renderer (`keynote-render.mjs`) runs only its own script on a page it writes: demo.json
  wording reaches it as data and is set with `textContent`, never parsed as HTML; colours must be
  `#hex` (checked by the schema, by Python and again in Node); fonts load only from the plugin's
  `assets/fonts/`; images are `data:` URIs made from files inside the demo folder; every request is
  blocked; and every PNG it writes must land inside the build's work folder, never through a symlink. Paths
  in ffmpeg concat lists are quoted per ffmpeg's rules, and scripts pass values to Python as
  arguments, never inside its source.
- **The local editor being used by other sites.** It binds to `127.0.0.1` only, accepts only
  `127.0.0.1` or `localhost` on its own port as the Host (against DNS rebinding), refuses requests
  a browser marks `Sec-Fetch-Site: cross-site`, requires an `x-studio` header on every write (which
  a cross-site page cannot send without a CORS preflight the editor never approves), and forbids
  framing (`frame-ancestors 'none'`, `X-Frame-Options: DENY`). The built editor page also sends a
  Content-Security-Policy that allows only its own scripts, styles, fonts and requests
  (`default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  images and media also from `data:` and `blob:`; inline styles for React's style attributes). The
  page needs no eval: its schema validators are compiled when the UI is built. The dev server keeps
  only the framing rule. Open and Reveal launch a file in its app only when it is a
  regular file of a passive type; folders (which can be app bundles) are only revealed. It serves files only from the demo
  folder it was opened on, only regular files, and only video, images and text inline; anything
  else is a download, under a sandboxing Content-Security-Policy. Saving a file requires the hash
  of the version the editor loaded, so a stale or blind write cannot replace an edit made on disk.
- **The frame receiver being used by anything but your scenes.** It binds to `127.0.0.1` only and
  requires a random per-run token in an `x-rx-token` header on every request. The token is written
  to `recordings/.rx-token` (mode 600, gitignored by `new-demo.sh`) and put into scene code by
  `mk-scene.sh`, `mk-lib.sh` and `rec.mjs`. It also refuses requests with an `Origin` header or a
  foreign Host, take names that are dot segments, oversized bodies, frames that are not JPEG, and
  blur boxes that are not plain numbers.
- **Code from the current folder.** Scripts load `playwright-core` only from the plugin's own
  `node_modules`, never from the folder they run in. `doctor.sh` suggests a pinned
  `@playwright/mcp` version. `rec.mjs` and `run.mjs` check demo.json's `windows` (whole port numbers
  from 1024 to 65535, a plain `match` string) and `browser` (timezone, locale) before they use them.
- **The CI workflow handing out a token.** Every action is pinned to a full commit SHA, and checkout
  does not leave the job's token in the repository's git config (`persist-credentials: false`).

## What it does not prevent

- **Masking is pattern based and only sees the top page's DOM.** It catches token-shaped text and
  values next to known labels, in text and form fields of the top-level document. It does not see
  inside canvas, images, video, iframes or shadow DOM, and it misses secrets in shapes nobody
  listed. Check those by hand (and add a blur box with `blur()` / `blurRect()`); that is why the
  frame-by-frame check is a required step and why only sandbox or test accounts should be filmed.
- Recordings, contact sheets and handoff zips show whatever was on screen. Treat them as you would
  treat screenshots of that account.
- **Scene scripts are code.** The recorded browser is logged in as you, and a scene (including one
  in a shared demo folder) runs with that session's access. Read a scene before running one you did
  not write. The path and input checks above protect the build scripts, not scene code.
- Other programs running as your user can read `recordings/.rx-token` and talk to the local
  servers; these protections are against websites and shared files, not local malware.
- **`open-window.sh` opens a Chrome remote debugging port.** While that window is open, any local
  process can drive it, with your logged-in session, through the port on `127.0.0.1`. Close the
  window when you are done recording.
- **Open and Reveal hand files to your operating system.** Opening a video, image or text file from
  the editor starts the app your system uses for that type, and that app parses the file. Reveal
  only shows it in the file manager.
- **ffmpeg parses untrusted media.** The protocol whitelist stops it reaching outside local files,
  but a crafted video can still target a bug in ffmpeg's decoders. Keep ffmpeg updated (6.0 or
  newer; `doctor.sh` checks).
- A leaked credential is not un-leaked by deleting a take. Rotate anything that was pasted into a
  chat or shown on screen, even blurred.
