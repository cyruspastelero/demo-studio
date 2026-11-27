# FAQ

[Back to the README](../README.md)

### Do I have to give the agent my password?

No. Log in yourself in the browser the Playwright MCP opens, and the agent never sees the password.

If you'd rather hand over a demo account:

1. Store the password in macOS Keychain yourself. This prompts for it without showing it:
   `security add-generic-password -s demo-<name> -a '<login email>' -w`
2. Tell the agent the item name (`demo-<name>`).

The agent logs in before recording starts, so the login is never filmed. It never repeats the
password in chat or logs, and never writes it to a file (unless you ask for a gitignored `app/.env`).
It asks for a 2FA code when the site wants one, and refuses an account with real customer data unless
you confirm it's a test account.

When you're done, remove the item: `security delete-generic-password -s demo-<name>`

### Is anything sent to the cloud?

demo-studio itself sends nothing: no account, no telemetry. Recording, editing, narration with macOS
`say` and the studio all run on your machine, and the studio only listens on your own computer.

Two things do leave it:

- **Your coding agent** talks to its AI provider as usual, so what it reads in the session (your
  messages, page snapshots, contact sheets of frames) goes to that model.
- **A paid voice or music service**, such as ElevenLabs or Higgsfield, gets the voiceover text, but
  only if you choose one.

### What does it cost?

- demo-studio is free and open source (MIT).
- Its tools are free: Playwright, Chrome, ffmpeg, Python and Node.
- Your coding agent runs on your usual plan.
- Narration is free with macOS `say` or your own voice. ElevenLabs and Higgsfield cost money only if
  you choose them.
- The agent stops and asks before any step in your product that would cost money.

### Where do the files go?

Each demo lives in `demos/<name>/` (or `$DEMO_ROOT/<name>/`). Nothing is written into the demo-studio
folder itself.

| What | Where |
| --- | --- |
| Raw takes | `recordings/raw/` |
| Finished cuts | `recordings/exports/` |
| Editor package | `recordings/editor-handoff/`, with the zip next to it |

### How long does it take?

- Planning: 15 to 30 minutes.
- Recording: about 5 to 10 minutes per scene, including checks. A 10-scene demo is an afternoon.
- A 40-second cut builds in one to two minutes on a laptop. Rebuilds are faster.

### How much disk space do I need?

Keep 10 GB free. A 60-second take uses 0.5 to 1 GB of frames until it's approved; the finished clips
are small. Delete `recordings/frames/` after sign-off (the agent asks first).

### How do I re-shoot one scene?

Ask: "re-shoot scene 04, the bot reply was slow". The agent records a new take, marks it as the one to
keep, and you rebuild. If the scene shows data that changed, re-shoot the scenes that depend on it
(the shot list's "Depends on" column says which).

### How do I change the branding?

- **The video's look** (accent colour, background, font, logo): `brand` in the demo's `demo.json`, or
  pick a look template.
- **Title cards** (colours, logo, taglines): `brand` and `cards` in `handoff.json`, then rebuild the
  cards with `node "$P/scripts/title-cards.mjs" handoff.json`.

Everything else in the look follows [the quality bar](quality-bar.md) or the template you picked.

### How do I add a voiceover?

Give each scene a `voiceover` line in `demo.json` (or `handoff.json`): spoken English, about 2.5 words
a second, no symbols. `narrate.py` checks each line fits, voices it and places it in the cut. Writing
tips: [references/voiceover.md](../references/voiceover.md).

### Can I record two people at once (say, an admin and a member)?

Yes. `scripts/open-window.sh` opens a Chrome window per person, each with its own profile. List them
under `windows` in `demo.json` and the agent records each one.

### Is it safe to film?

Only with sandbox or test accounts. Secrets are blurred in the page as it renders, and every frame is
checked for anything that slipped through. More in [references/secrets.md](../references/secrets.md).
