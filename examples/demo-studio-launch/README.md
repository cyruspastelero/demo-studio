# demo-studio-launch

demo-studio's own launch video, made with demo-studio. It's a 70 second narrated keynote cut of
the public demo site, its live editor, the GitHub repo and the two sample videos. There's no
login, no secrets and nothing to clean up.

**Mode:** our script
**Goal:** show in about a minute that one sentence to Claude Code becomes a finished, narrated demo
video of your real app
**On screen:** https://cyruspastelero.github.io/demo-studio/ and its live editor, the public repo,
and clips of the two finished sample videos
**Recorded:** 2026-11-22, one take per scene

Watch it: [sample-launch.mp4](https://github.com/cyruspastelero/demo-studio/releases/download/samples/sample-launch.mp4).
The same footage cut as a motion-graphics ad is in [examples/launch-ad](../launch-ad).

## What is here

| File | What it is |
| --- | --- |
| `BRIEF.md` | The goal, the audience and every claim with the shot that proves it |
| `SHOT-LIST.md`, `RUN-SHEET.md` | The scenes and the exact on-screen steps |
| `VOICEOVER.md` | The narration, line by line, as spoken |
| `recordings/scenes/*.body.js` | The scene scripts that drove the browser |
| `recordings/scenes/_project.js` | Cursor and masking settings |
| `recordings/takes.csv` | The take log |
| `demo.json` | The keynote cut: a 2 s title, a fast montage of real output, hard cuts between tight crops of one take, zooms, highlights, pills, the end card, voice and music |
| `handoff.json` | Drives the 4:5 and 9:16 social versions with captions |
| `assets/logo.svg` | The logo for the end card |

The raw takes, music and voice files aren't included (about 30 MB). Record the scenes again and
make your own bed and voice as below.

## Make it yourself

1. Copy the folder into your demos folder and start a fresh take log, as in
   [the todo sample](../todo-sample/README.md#record-it-yourself).
2. Shots 09 and 10 are trims of the two finished samples, not screen recordings. Download them
   into `source/`:
   ```bash
   gh release download samples -R cyruspastelero/demo-studio -p 'sample-showcase.mp4' -p 'sample-todo.mp4' -D source
   ```
   Then transcode the parts listed in `recordings/takes.csv` to the raw-take spec
   (1920x1080, 30 fps, silent) as `recordings/raw/09-showcase-sample-t1.mp4` and
   `10-todo-sample-t1.mp4`.
3. Record scenes 01, 02, 03, 05, 06, 07, 08 and 11 with skill `demo-record`, using the URL
   https://cyruspastelero.github.io/demo-studio/.
4. Make a music bed of about 72 s as `music/bed.m4a` (ElevenLabs `compose_music`, or your own
   licensed track), then build and narrate:
   ```bash
   python3 -I "$P/scripts/build-keynote.py" demo.json
   python3 -I "$P/scripts/narrate.py" demo.json            # your voiceover files, else macOS say; add --voice elevenlabs for ElevenLabs
   python3 -I "$P/scripts/check-cut.py" recordings/exports/made-with-demo-studio-keynote-cut-narrated.mp4
   ```

## Choices worth copying

- **A hook before the story.** The first 3 s show finished output, not a logo.
- **One take, several shots.** Scenes 02, 03 and 11 are each cut into two tight crops of one take,
  so the stages move fast without needing a zoom for each.
- **Claims cut to the footage.** The editor shown is the server-less replay, so the narration
  doesn't claim it runs on 127.0.0.1.
- **The music builds into the end card** and dips once, when the finished result appears.
