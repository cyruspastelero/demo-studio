---
name: demo-record
description: Record demo footage scene by scene. Sets up the 2x Playwright recording rig and frame receiver, copies and adapts a scene recipe, drives the logged-in browser (or several demo windows) with human-looking pointer and typing, masks secrets in the page, QAs frames on contact sheets, encodes 1080p 30fps takes, keeps the take log and handles re-shoots. Use when recording, re-shooting or QA-ing demo takes.
---

# Demo record

Read once before the first take: `$P/references/learnings.md` (gotchas), `$P/references/secrets.md`
(masking), `$P/references/style-guide.md` sections 3 to 6 (pointer, typing, pacing, scrolling).

Start every shell command with this line (it finds the plugin folder):

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
```

`<cwd>` below means the folder Claude Code was started in. `<demo>` is the demo folder.

## Step 1: rig (once per browser session)

1. Check disk: `df -h .` must show 10 GB or more free.
2. Start the frame receiver, **in the background** (`run_in_background: true`):
   ```bash
   cd <demo>/recordings && node "$P/scripts/frame-receiver.mjs" .
   ```
   Expected: `frame-receiver on 127.0.0.1:8765, frames in ...`. If the port is in use, a receiver
   is already running: leave it.
3. Write the setup file (one URL per tab the demo uses):
   ```bash
   export PLAYWRIGHT_MCP_OUT="<cwd>/.playwright-mcp"
   cd <demo>/recordings && DEMO_TIMEZONE=America/New_York bash "$P/scripts/mk-setup.sh" https://app.example.com/
   ```
   Expected: a path ending in `scenes/_setup.run.js`.
4. Call the Playwright MCP tool `browser_run_code` (newer versions: `browser_run_code_unsafe`) with
   `filename` set to that path.

| If the result shows | Do this |
| --- | --- |
| every tab `landed` on the right page, `dpr: 2` | Go on |
| a tab landed on a login page | Ask the user to log in **in the Playwright MCP browser**, then repeat step 4 |
| `no browser handle` | The MCP runs a persistent context. Ask the user to restart it with `--isolated` |
| `filename` refused | `PLAYWRIGHT_MCP_OUT` is not `<cwd>/.playwright-mcp`. Fix it and repeat step 3 |

Repeat steps 3 and 4 whenever the MCP browser restarts.

**Two people in two windows:** instead of steps 3 and 4, run
`bash "$P/scripts/open-window.sh" <name> <port> <url>` once per person, ask the user to log in in
each window, and list them under `windows` in `<demo>/demo.json`. Record with `rec.mjs` (Step 2.3).

## Step 2: shoot one scene (repeat per scene, in SHOT-LIST.md order)

1. **Copy the recipe** named in SHOT-LIST.md's Recipe column:
   ```bash
   command cp "$P/samples/scenes/<recipe>.body.js" <demo>/recordings/scenes/<NN-name>.body.js
   ```
   Recipe list and when to use each: `$P/samples/README.md`. Also copy
   `$P/samples/scenes/_project.js` to `<demo>/recordings/scenes/_project.js` if it is still the template.
2. **Scout, then adapt.** For an unfamiliar page, run the scout body from
   `$P/references/scene-patterns.md` ("Scout run") to get the real button names. Then change every
   line marked `// CHANGE:` in the copied file, and rename `'_tmpNN'` to this scene's number.

   | Choice | Default | Use the other when |
   | --- | --- | --- |
   | type or paste | `typeHuman` | Paste when the text is longer than about 2 lines |
   | typing speed | 55ms | 70 to 75ms for a mention or a key phrase; 45ms for a long sentence |
   | wait | `locator.waitFor` on the result | Never a fixed sleep for something async |
   | pointer after an action | `park(p)` | `park(p, x, y)` when the default spot covers content |

3. **Wrap and run:**
   ```bash
   cd <demo>/recordings && bash "$P/scripts/mk-scene.sh" <NN-name>
   ```
   Expected: a path ending in `scenes/<NN-name>.run.js`. Call `browser_run_code` with that
   `filename`. For two windows: `node "$P/scripts/rec.mjs" <window> scenes/<NN-name>.body.js`.

   | If the run returns | Do this |
   | --- | --- |
   | `{ frames: N, ... }` with N above 0 | Go to step 4 (a still page sends few frames; that is fine) |
   | `expected <url>, on <other url>` | Redirected, often to a login. Ask the user to log in, re-run setup |
   | `bad viewport` | Add `await prep(p)` right before `record()` |
   | `frame receiver refused start` | Disk under 4 GB or the receiver stopped. Check `df -h`, restart it |
   | a locator timeout | The label differs. Scout again and fix the `// CHANGE:` line |
   | `glide target not visible` | Scroll first with `scrollIntoCenter(p, locator)` |

4. **QA the frames** before encoding:
   ```bash
   python3 -I "$P/scripts/tile-frames.py" frames/_tmpNN 0 30 /tmp/sheet.png every=8
   ```
   Read `/tmp/sheet.png`. Check: no banners or toasts, the pointer is not on the content being read,
   the action finished, the head and tail are still. For a secret reveal, check **every frame**
   across it (`every=1`, see the recipe header). Then do the "verify after the take" list in the
   recipe's header comment.
5. **Encode:**
   ```bash
   bash "$P/scripts/encode-take.sh" frames/_tmpNN <NN-name> "what happened, latencies"
   ```
   Expected: `raw/<NN-name>-tN.mp4 (12.3s, 1920x1080); frames kept in frames/<NN-name>-tN`.
6. **Log:** in `recordings/takes.csv`, change the new row's status from `new` to `keep`, `alt` or
   `reject`, and say why in the notes. Exactly one `keep` per scene.
7. **Throwaways:** add every item created on camera (keys, records, invites) to THROWAWAYS.md now.

Scene done when: one `keep` row, the recipe's verify list passed, THROWAWAYS.md updated.

## Step 3: re-shoot

| Problem | Re-shoot? |
| --- | --- |
| The action failed, or clutter or a toast showed | Yes |
| The pointer covered what the viewer reads | Yes |
| A secret was visible for even one frame | Yes, and never patch it in post |
| A long wait | No. Trim it in the edit |
| Seed data changed | Yes, every scene in its "Depends on" chain, in one pass |

Run the reset script in `<demo>/tools/` between takes. The next take number is automatic. Keep
frames until the take is approved; re-encodes are cheap, re-shoots are not.

## Done when

- [ ] Every scene in SHOT-LIST.md has exactly one `keep` row in `recordings/takes.csv`
- [ ] No row is still `new`
- [ ] Every secret-bearing take was checked frame by frame
- [ ] THROWAWAYS.md lists everything created on camera
- [ ] Next: skill `demo-edit`, Step 1 (review reel)
