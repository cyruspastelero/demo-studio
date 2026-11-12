# Security

## Reporting a problem

Report security problems privately through GitHub: open the repository's Security tab and choose
"Report a vulnerability". Please do not open a public issue for them.

Include what you found, how to reproduce it, and what someone could do with it.

## What demo-studio is designed to prevent

- **A secret appearing in footage.** Token-shaped text and labelled fields are blurred in the page
  as they render, before a frame is captured, and every reveal is checked frame by frame. The rules
  are in [references/secrets.md](references/secrets.md).
- **Secrets written to disk.** Skills and templates keep secrets out of every file except a demo's
  gitignored `app/.env`. The starter `check.py` reports `.env` files anywhere else.
- **The local editor being reachable from the network.** It binds to `127.0.0.1` only and serves
  files only from the demo folder it was opened on.
- **The frame receiver being reachable from the network.** It binds to `127.0.0.1` only.

## What it does not prevent

- Masking is pattern based. A secret in a shape nobody listed, or drawn inside a canvas or an
  image, is not caught automatically. That is why the frame-by-frame check is a required step and
  why only sandbox or test accounts should ever be filmed.
- Recordings, contact sheets and handoff zips show whatever was on screen. Treat them as you would
  treat screenshots of that account.
- The recorded browser is logged in as you. Scene scripts run with that session's access, so read a
  scene before running one you did not write.
- A leaked credential is not un-leaked by deleting a take. Rotate anything that was pasted into a
  chat or shown on screen, even blurred.
