# Security

## Reporting a problem

Report security problems privately through GitHub: open the repository's Security tab and choose
"Report a vulnerability". Please do not open a public issue for them.

Include what you found, how to reproduce it, and what someone could do with it.

## Threat model

Two assumptions shape everything below:

- **Demo folders may come from other people.** A shared `handoff.json`, `demo.json`, `takes.csv`,
  logo or voiceover folder is untrusted input.
- **Any website open in your browser can send requests to `127.0.0.1`.** Local servers must not
  trust a request just because it arrived on the loopback address.

## What demo-studio is designed to prevent

- **A secret appearing in footage.** Token-shaped text and labelled fields are blurred in the page
  as they render, before a frame is captured, and every reveal is checked frame by frame. The rules
  are in [references/secrets.md](references/secrets.md).
- **Secrets written to disk.** Skills and templates keep secrets out of every file except a demo's
  gitignored `app/.env`. The starter `check.py` reports `.env` files anywhere else.
- **Config paths reaching outside the demo folder.** Every path read from `handoff.json`,
  `demo.json` or `takes.csv` (raw and output folders, title cards, logos, headshots, reference
  files, social inputs and outputs, caption images, the music bed, voiceover recordings) must be
  relative, without `..`, and must resolve (symlinks included) inside the demo folder. The schemas
  reject absolute and `..` paths, and the scripts check again after resolving, then stop with an
  error that names the field. Folders are only deleted when they are inside the demo's output
  folder, and never through a symlink. Paths you type on the command line (such as
  `narrate.py --music`) are yours and are not restricted.
- **Config values running as code.** Title-card colours and fonts must pass a strict whitelist
  (hex, `rgb()` or a colour name; a font-family list), all wording is HTML-escaped, and the card
  page renders with JavaScript off and every request blocked except inline `data:` images. Paths
  in ffmpeg concat lists are quoted per ffmpeg's rules, and scripts pass values to Python as
  arguments, never inside its source.
- **The local editor being used by other sites.** It binds to `127.0.0.1` only, accepts only
  `127.0.0.1` or `localhost` on its own port as the Host (against DNS rebinding), refuses requests
  a browser marks `Sec-Fetch-Site: cross-site`, requires an `x-studio` header on every write (which
  a cross-site page cannot send without a CORS preflight the editor never approves), and forbids
  framing (`frame-ancestors 'none'`, `X-Frame-Options: DENY`). It serves files only from the demo
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
  `@playwright/mcp` version.

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
- A leaked credential is not un-leaked by deleting a take. Rotate anything that was pasted into a
  chat or shown on screen, even blurred.
