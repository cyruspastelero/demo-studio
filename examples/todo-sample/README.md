# todo-sample

A thirty second demo of a public todo app, made end to end with demo-studio. It is the smallest
complete example: three scenes, no login, no secrets, nothing to clean up afterwards.

![The finished cut](../../docs/img/sample-todo.gif)

**Mode:** our script
**Goal:** show what the plugin produces from a real app, with nothing staged
**App on screen:** the [TodoMVC](https://todomvc.com) React example, a public sample app. It is not ours.
**Recorded:** 2026-11-12, one take per scene

## What is here

| File | What it is |
| --- | --- |
| `SHOT-LIST.md` | The three scenes |
| `recordings/scenes/*.body.js` | The scene scripts that drove the browser |
| `recordings/scenes/_project.js` | Cursor and masking settings |
| `recordings/takes.csv` | The take log, each take marked `keep` |
| `demo.json` | The keynote cut, planned to [the quality bar](../../docs/quality-bar.md): trims, speed, crop, zooms, highlight boxes, callout pills, hero and end cards, voice and music |
| `handoff.json` | The promo cut for an editor: shots, voiceover lines, brief, claims |

The three raw takes (about 400 KB) are in `recordings/raw/`, so the editor can open and play this
example straight away: `npm run studio examples/todo-sample`. Recording them again takes about two minutes.

## Record it yourself

From the folder you started Claude Code in, with the Playwright MCP set up (`P` is the plugin folder):

```bash
cp -R "$P/examples/todo-sample" demos/todo-sample && cd demos/todo-sample/recordings
mkdir -p raw frames exports && head -1 takes.csv > t && mv t takes.csv   # start a fresh take log
command rm -f raw/*.mp4                                     # and drop the shipped takes
export PLAYWRIGHT_MCP_OUT="<the folder Claude Code started in>/.playwright-mcp"
node "$P/scripts/frame-receiver.mjs" .                      # leave running
bash "$P/scripts/mk-setup.sh" https://todomvc.com/examples/react/dist/
bash "$P/scripts/mk-scene.sh" 01-add-todos                  # then 02 and 03
```

Ask Claude to run each printed `.run.js` file with the Playwright MCP, check the frames, and encode
each take with `encode-take.sh`. Or just ask: "try demo-studio on the todo sample".

Then cut it:

```bash
cd .. && python3 -I "$P/scripts/review-reel.py" recordings --config demo.json
node "$P/scripts/title-cards.mjs" handoff.json && python3 -I "$P/scripts/build-handoff.py" handoff.json
python3 -I "$P/scripts/build-keynote.py" demo.json
python3 -I "$P/scripts/make-bed.py" music/bed.m4a --seconds 40   # a free music bed (or use your own)
python3 -I "$P/scripts/narrate.py" demo.json                # adds the voiceover (macOS say by default)
python3 -I "$P/scripts/check-cut.py" recordings/exports/todo-app-sample-keynote-cut-narrated.mp4 --frames recordings/exports/checklist
```

## Test sweep

| Path | How it was checked | Result |
| --- | --- | --- |
| Add three todos | Scene waits for each todo's text to appear | pass |
| Tick two, filter Active, Completed, All | Scene waits for "1 item left" | pass |
| Clear completed | Scene waits for the second row to be gone; one todo left | pass |
| The app URL | Opened fresh in a new browser context, no login | pass |

## Notes from this shoot

- The site shows a side panel about the framework on wide screens. It is not part of the app, so
  scene 01 hides it with one line of CSS before recording.
- The pointer clicks the right end of the input, so it does not sit on top of the text being typed.
- The app is small in a 1440 wide page. The raw takes are left unzoomed; `demo.json` crops the
  window to the list (`crop: [540, 150, 840, 430]`, so body text lands near 40 px cap height) and
  zooms the whole window to 1.15x on the second tick and on Clear completed, each with a highlight box.
- The shipped takes were recorded with the arrow cursor. Re-recording uses the pointing hand
  (`cursor: 'hand'` in `_project.js`), the house default.
- While the list is short (scene 01 before the first todo, scene 03 after Clear completed) the
  window shows a lot of empty page, which the bar's W2 item flags. A tighter crop would cut the
  list once it grows; the honest fix is to start scene 01 with one todo already there.

## Status

- 2026-11-12: recorded, reviewed and cut. Nothing was created outside the page, so there are no throwaways.
- 2026-11-18: re-cut with the quality-bar engine: 37.2 s, `check-cut.py` 44 pass, 0 fail; the cursor
  and empty-panel items are the known gaps above.
