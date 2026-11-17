# FAQ

[Back to the README](../README.md)

### Do I have to give Claude my password?

No. You can log in yourself in the browser the Playwright MCP opens, and Claude never sees the
password. If you would rather hand over a demo account, store the password in macOS Keychain
yourself (`security add-generic-password -s demo-<name> -a '<login email>' -w` prompts for it
without echoing) and tell Claude the item name. Claude logs in before recording starts, so the
login is never filmed, and in-page masking stays on. It never repeats the password in chat or
logs, and writes it to no file, except a gitignored `app/.env` if you ask for one. It asks for a
2FA code at the moment the site wants it, and it refuses an account with real customer data
unless you confirm it is a test account. Use sandbox or test accounts only. Remove the Keychain
item when you are done: `security delete-generic-password -s demo-<name>`.

### Is anything sent to the cloud?

The plugin itself sends nothing: no account, no telemetry. Recording, encoding, editing,
narration with macOS `say` and the editor all run on your machine, and the editor listens on
127.0.0.1 only. Two things to know. Claude Code talks to Anthropic as it always does, so whatever
Claude reads in the session (your messages, page snapshots, contact sheets of frames) goes to the
model. And if you choose a paid voice or music service such as ElevenLabs or Higgsfield, the
voiceover text goes to that service.

### What does it cost?

The plugin is free and open source (Apache 2.0). The tools it uses are free: Playwright, Chrome,
ffmpeg, Python and Node. You need Claude Code, which runs on your usual Claude plan or API usage.
Narration is free with macOS `say` or your own voice. ElevenLabs or Higgsfield cost money only if
you choose to use them. Claude stops and asks before any step in your product that would cost money.


**Where do files go?** Each demo lives in `$DEMO_ROOT/<name>/` (default `./demos/<name>/` under the
folder you started Claude in). Raw takes in `recordings/raw/`, cuts in `recordings/exports/`, the
editor folder in `recordings/editor-handoff/` and the zip next to it. Nothing is written into the
plugin folder.

**How long does it take?** Planning 15 to 30 minutes. Recording about 5 to 10 minutes per scene
including QA, so a 10-scene demo is an afternoon. A 40-second keynote cut builds in one to two
minutes on a laptop (graphics are cached, so rebuilds are faster); the full handoff takes a few minutes.

**How much disk space?** Have 10 GB free. A 60-second take is 0.5 to 1 GB of frames until it is
approved; the encoded clips are small. Delete `recordings/frames/` after sign-off (Claude asks first).

**How do I re-shoot one scene?** Ask: "re-shoot scene 04, the bot reply was slow". Claude records a
new take (`04-...-t2.mp4`), marks it `keep` in `takes.csv`, and you rebuild. If the scene shows
seeded data that changed, re-shoot every scene that depends on it (the shot list's "Depends on" column).

**How do I change branding?** Edit `brand` and `cards` in the demo's `handoff.json` (colours, font,
logo, taglines), then `node "$P/scripts/title-cards.mjs" handoff.json` and rebuild. The keynote
look's accent colour, background, outro gradient, font (bundled Inter or Geist) and dark-outro logo are
`brand` in `demo.json`; every other look value is fixed by [the quality bar](quality-bar.md).

**How do I add voiceover?** Put a `voiceover` line on the items in `demo.json` (or on each scene in
`handoff.json`): spoken English, about 2.5 words per second, no symbols. `narrate.py` records and
places them on the keynote cut; `build-handoff.py` checks each line fits and writes the script with
start times for an editor. Rules: [references/voiceover.md](../references/voiceover.md).

**Can I record two people at once (an admin and a member)?** Yes. `scripts/open-window.sh` opens a
Chrome window per person with its own profile; list them in `demo.json` `windows` and Claude records
each with `scripts/rec.mjs`.

**Is it safe to film?** Only with sandbox or test accounts. Secrets are blurred in the page as they
render and every reveal is checked frame by frame. See [references/secrets.md](../references/secrets.md).
