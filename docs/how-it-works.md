# How it works

[Back to the README](../README.md)

## What it makes

| Deliverable | What it is |
| --- | --- |
| Plan | BRIEF, RUN-SHEET (beats and exact on-camera text), SHOT-LIST, VOICEOVER draft, PREP checklist |
| Raw takes | One clean clip per scene: 1920x1080, 30fps, H.264, crisp 2x capture, secrets blurred in the page, logged in `takes.csv` |
| Review reel | The keeper takes joined uncut in story order, for the first review |
| Keynote cut | Built to the [quality bar](quality-bar.md): footage cropped into a floating window on a soft pastel background, whole-window zooms, highlight boxes, callout pills, word-by-word Inter titles, end card and logo outro |
| Narrated cut | The keynote cut with the voiceover recorded and placed over a music bed 13 dB under it, -14 LUFS, true peak under -1 dBTP |
| Promo cut | About 1:30, the story, as numbered clips plus a rough assembly |
| How-to cut | About 3:00, the story plus setup steps and an edge case |
| Voiceover scripts | Spoken lines per scene with start times, a fit check, and a timing preview |
| Editor handoff zip | READ-ME-FIRST brief, scripts, clips, uncut source footage by story part, contact sheets, title cards, brand sheet |
| Social versions | 4:5 (1080x1350) and 9:16 (1080x1920) cuts with a caption band |

## Stages

```
 goal or brief
      |
  [plan]      demo-plan     BRIEF, RUN-SHEET, SHOT-LIST, VOICEOVER, PREP, demo.json
  [prep]      demo-plan     sandbox accounts, seeded demo user, reset scripts, test sweep
  [record]    demo-record   2x screencast per scene, secrets masked, contact-sheet QA, takes.csv
  [review]    demo-edit     review reel of keepers, agreed with you
  [edit]      demo-edit     keynote cut, narration, promo + how-to, title cards, voiceover fit check
  [handoff]   demo-handoff  editor folder + zip, READ-ME-FIRST, brand sheet
  [social]    demo-edit     4:5 and 9:16 versions
  [wrap-up]   demo-handoff  status, throwaways, key rotation, delete frames
```

The `demo-studio` skill runs the stages in order; each stage has its own skill you can also call
directly. The skill also triggers on "record a walkthrough of...", "film a product demo..." or
"hand these takes to an editor".

## What makes a demo look good

The house look, in short. The full guide an agent follows is
[references/style-guide.md](../references/style-guide.md).

- **Crisp capture.** A 1440x810 viewport at 2x pixel density, downscaled to 1080p, so UI text reads.
- **A clean frame.** No banners, toasts, cookie bars or personal history. One consistent, seeded world.
- **A calm pointer.** A soft blue disc with a white ring (drawn into the page, so it scales with the
  window), gliding on an eased arc, a short pause before each click, then parked out of the way.
  Never a teleport, never the OS arrow.
- **Human typing.** 45 to 75ms a key for short text; long text is pasted.
- **Room to breathe.** A still second at the start of every take, a hold at the end, and about two
  seconds on every result. Waits are trimmed in the edit, not hidden.
- **Restrained zooms.** The whole window to 1.15x over 1.1 s, about one every 11 s, only where the
  narration makes a point, with a red box on the element it names.
- **Short callouts.** A pill under the window for 3 to 5 s: a person (name, role) or a statement of
  six words at most.
- **A measured bar.** Every number above is in [docs/quality-bar.md](quality-bar.md), and
  `scripts/check-cut.py` runs its checklist on a finished cut.
- **A voice like a colleague.** Second person, present tense, about 2.5 words a second, numbers and
  URLs spelled out, music quiet under it.

## Rules and quality gates

A demo that shows something a viewer cannot repeat is worse than no demo. The plugin holds the line
on a few things, written out in [references/quality-gates.md](../references/quality-gates.md):

- **Claims list.** Every claim the video makes maps to a shot that proves it, or it is cut.
- **Test sweep before any take.** Every scene and edge case run off camera from a clean state, the
  hero flow twice, and a hunt for dead ends: links, commands and setup steps a viewer could not repeat.
- **Secrets are masked in the page, never in post**, and every reveal is checked frame by frame
  ([references/secrets.md](../references/secrets.md)). Sandbox or test accounts only.
- **Real actions, cleaned up.** Things are created for real on camera, listed in THROWAWAYS.md and
  deleted after sign-off. Nothing is faked.
- **Cold follow-through.** Before sending, the how-to script is followed literally on a fresh account.

## Finishing the video

The video is finished on your machine in two commands:

```bash
python3 -I "$P/scripts/build-keynote.py" demo.json      # the cut: window, pills, boxes, zooms, cards
python3 -I "$P/scripts/narrate.py" demo.json            # adds the voiceover and music bed
python3 -I "$P/scripts/check-cut.py" recordings/exports/<slug>-keynote-cut-narrated.mp4   # the bar's checklist
```

`narrate.py` reads the `voiceover` lines in `demo.json`, renders each one, places it at its item's
start, checks every line fits before the next one, loops and ducks a music bed under the speech
with a fade in and out, normalises loudness, and writes a `-narrated.mp4` next to the cut in
`recordings/exports/`. `--dry-run` checks the timing without rendering. Pick the voice with `--voice`:

| Voice | Cost | How |
| --- | --- | --- |
| `say` | Free | macOS built-in voice |
| `files` | Free, or what your voice tool charges | Ready-made audio, `voiceover/01.mp3`, `02.mp3`... one per line: your own recordings, or files made with the ElevenLabs or Higgsfield MCP |
| `elevenlabs` | Your ElevenLabs plan | `export ELEVENLABS_API_KEY=...` in your shell, or keep the key in the macOS Keychain and `export ELEVENLABS_KEYCHAIN_SERVICE=<item name>`. The key is never stored in a file. Lines are cached in `recordings/voice-cache/`, so re-runs cost nothing |

With no `--voice`, it uses your files when `voiceover/` has them, else ElevenLabs when it finds a
key, else `say`.

**MCP voice tools.** `narrate.py demo.json --export-lines` writes `voiceover/lines.json`: each
line's text, the file to save it as (`voiceover/NN.mp3`), its start, time budget and a word budget.
Claude reads it, makes each file with the ElevenLabs MCP (`text_to_speech`) or the Higgsfield MCP
(`generate_audio`), and runs `narrate.py demo.json --voice files`. Missing files are listed by
number with the next command. Higgsfield works only this way, since its public API has no text to
speech endpoint.

**Music.** Save a bed as `music/bed.m4a`: your own instrumental, a free one from
`scripts/make-bed.py`, or one made with the ElevenLabs MCP (`compose_music`) or the Higgsfield MCP
(`generate_audio` with a music model). narrate.py sets it 13 dB under the voice.
`--export-lines` also writes `music/README.txt` with the length to ask for.

Optional settings go in a `voice` object in `demo.json`, for example
`{"provider": "files", "music": "music/bed.m4a", "music_dips": [{"at": 12.0, "dur": 1.5}], "music_fade_in": 1.0}`.

For a human editor, `build-handoff.py handoff.json` builds the promo and how-to as numbered clips
and rough assemblies, the voiceover scripts with start times, and the handoff zip.

## Optional extras

- **ElevenLabs** for a more natural narration voice, by API key or through its MCP server. Uses
  your ElevenLabs credits; lines rendered by key are cached and never charged twice.
- **Higgsfield** through its MCP server, for narration or a music bed. Uses your Higgsfield credits.

## Samples and examples

| Where | What it is |
| --- | --- |
| [samples/](../samples) | Scene recipes to copy (form with an error, dashboard tour, masked secret, AI reply, dialog, settings toggle, table search, two people) and a full sample plan for a fictional analytics product |
| [examples/todo-sample](../examples/todo-sample) | The GIF above: a real demo recorded and cut with the plugin, with its scene scripts and configs |
| [examples/acme-invoice-bot](../examples/acme-invoice-bot) | A filled-in plan for a fictional chat bot, with a client brief and two windows |
