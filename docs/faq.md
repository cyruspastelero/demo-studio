# FAQ

[Back to the README](../README.md)


**Where do files go?** Each demo lives in `$DEMO_ROOT/<name>/` (default `./demos/<name>/` under the
folder you started Claude in). Raw takes in `recordings/raw/`, cuts in `recordings/exports/`, the
editor folder in `recordings/editor-handoff/` and the zip next to it. Nothing is written into the
plugin folder.

**How long does it take?** Planning 15 to 30 minutes. Recording about 5 to 10 minutes per scene
including QA, so a 10-scene demo is an afternoon. The keynote cut renders in about one second of CPU
per second of output; the full handoff takes a few minutes.

**How much disk space?** Have 10 GB free. A 60-second take is 0.5 to 1 GB of frames until it is
approved; the encoded clips are small. Delete `recordings/frames/` after sign-off (Claude asks first).

**How do I re-shoot one scene?** Ask: "re-shoot scene 04, the bot reply was slow". Claude records a
new take (`04-...-t2.mp4`), marks it `keep` in `takes.csv`, and you rebuild. If the scene shows
seeded data that changed, re-shoot every scene that depends on it (the shot list's "Depends on" column).

**How do I change branding?** Edit `brand` and `cards` in the demo's `handoff.json` (colours, font,
logo, taglines), then `node "$P/scripts/title-cards.mjs" handoff.json` and rebuild. The keynote
look's colours and type are in `scripts/mk-assets.py` and `scripts/build-keynote.py`.

**How do I add voiceover?** Put a `voiceover` line on the items in `demo.json` (or on each scene in
`handoff.json`): spoken English, about 2.5 words per second, no symbols. `narrate.py` records and
places them on the keynote cut; `build-handoff.py` checks each line fits and writes the script with
start times for an editor. Rules: [references/voiceover.md](../references/voiceover.md).

**Can I record two people at once (an admin and a member)?** Yes. `scripts/open-window.sh` opens a
Chrome window per person with its own profile; list them in `demo.json` `windows` and Claude records
each with `scripts/rec.mjs`.

**Is it safe to film?** Only with sandbox or test accounts. Secrets are blurred in the page as they
render and every reveal is checked frame by frame. See [references/secrets.md](../references/secrets.md).
