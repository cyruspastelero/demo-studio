---
name: demo-record
description: Record demo footage scene by scene. Sets up the 2x Playwright recording rig and frame receiver, copies and adapts a scene recipe, drives the logged-in browser (or several demo windows) with human-looking pointer and typing, masks secrets in the page, QAs frames on contact sheets, encodes 1080p 30fps takes, keeps the take log and handles re-shoots. Use when recording, re-shooting or QA-ing demo takes.
---

# Demo record

Read once before the first take: `$P/references/learnings.md` (gotchas), `$P/references/secrets.md`
(masking), `$P/references/style-guide.md` sections 3 to 6 (pointer, typing, pacing, scrolling).

Start every shell command with this line (it finds the plugin folder):

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(d=$PWD; while [ "$d" != / ] && [ ! -f "$d/.claude-plugin/plugin.json" ]; do d=$(dirname "$d"); done; [ -f "$d/.claude-plugin/plugin.json" ] && echo "$d" || ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
```

`<cwd>` below means the folder Claude Code was started in. `<demo>` is the demo folder.

Do not ask the user anything in this skill except the stop cases in skill `demo-studio` (a login,
2FA code or captcha; something that cannot be deleted; something that costs money; deleting data
you did not create). Fix and re-shoot on your own.

## Step 0: log in (off camera, before any take)

Recording only happens inside a scene's `record()` call, so a login done now is never filmed.
Never put a login, a password field or a 2FA screen inside a scene.

**Way A (the user logs in):** call `browser_navigate` with the login URL, ask the user to log in in
the Playwright MCP Chrome window, wait for "done", then go to step 6 below.

**Way B (the user handed you demo credentials):**

1. Confirm skill `demo-studio` Step 3b passed (a sandbox or test account). If not, stop.
2. Read the password from Keychain (macOS):
   ```bash
   security find-generic-password -s demo-<name> -a '<login email>' -w
   ```
   Expected: one line, the password. Use it only in the next step. Never repeat it in a message.

   | If you see | Do this |
   | --- | --- |
   | `The specified item could not be found in the keychain.` | Use the password from this chat if the user pasted one; otherwise ask them to run `security add-generic-password -s demo-<name> -a '<login email>' -w` in their own Terminal window |
   | `security: command not found` (not macOS) | Use the password from this chat. Never write it to a file unless the user asked for `<demo>/app/.env` |

3. Call `browser_navigate` with the login URL, then `browser_snapshot` to find the fields.
4. Fill the form with `browser_fill_form` (or `browser_type` per field): the login email, then the
   password, then click the sign-in button with `browser_click`.
5. Handle what comes next:

   | The page shows | Do this |
   | --- | --- |
   | The app (dashboard, home) | Go to step 6 |
   | A 2FA code prompt | Ask the user now: "The site wants a 2FA code. Please send me the code." Type it straight away with `browser_type`. Never store it |
   | An "approve on your phone" prompt | Ask the user to approve it, then `browser_snapshot` again |
   | A captcha | Ask the user to solve it in the Playwright window and say done |
   | "Wrong password" or similar | Stop. Tell the user the login failed, without showing the password, and ask them to check it |

6. Call `browser_snapshot`. Done when it shows the logged-in app, not a login page.

**Session expired later** (a scene lands on a login page): stop that take, reject it in
`takes.csv`, log in again with this Step 0 (way B logs in again without asking; way A asks the
user), run Step 1 steps 3 and 4 again, then re-shoot the scene.

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
| a tab landed on a login page | Do Step 0 again (way B: log in yourself; way A: ask the user to log in **in the Playwright MCP browser**), then repeat step 4 |
| `no browser handle` | The MCP runs a persistent context. Ask the user to restart it with `--isolated` |
| `filename` refused | `PLAYWRIGHT_MCP_OUT` is not `<cwd>/.playwright-mcp`. Fix it and repeat step 3 |

Repeat steps 3 and 4 whenever the MCP browser restarts.

**Two people in two windows:** instead of steps 3 and 4, run
`bash "$P/scripts/open-window.sh" <name> <port> <url>` once per person, log in to each window
(way A: the user does it; way B: you do it, one Keychain item per person, `demo-<name>-<person>`),
and list them under `windows` in `<demo>/demo.json`. Record with `rec.mjs` (Step 2.3).

## Step 2: shoot one scene (repeat per scene, in SHOT-LIST.md order)

1. **Copy the recipe** named in SHOT-LIST.md's Recipe column:
   ```bash
   command cp "$P/samples/scenes/<recipe>.body.js" <demo>/recordings/scenes/<NN-name>.body.js
   ```
   Recipe list and when to use each: `$P/samples/README.md`. Also copy
   `$P/samples/scenes/_project.js` to `<demo>/recordings/scenes/_project.js` if it is still the template.
   Keep `cursor: 'dot'` there: the cursor is drawn into the footage at record time and cannot be
   changed in the edit.
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
   | `expected <url>, on <other url>` | Redirected, often to a login. Reject the take, do Step 0 again, re-run setup, re-shoot |
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

8. **Scout the edit targets** (for the cut's crop, zooms and highlights; quality bar W2, Z, H).
   Look up this scene's row in the SHOT-LIST.md **Edit plan**. In the scene body, right after the
   moment each target is on screen (after its `waitFor`, before `park`), measure it, and return the
   result with the take:
   ```js
   const scout = {
     ...await scoutRects(p, { region: p.locator('main') }),                    // CHANGE: the window region
     ...await scoutRects(p, { answer: p.getByText('471 of 1,240 signups') }),  // CHANGE: the highlight target
   };
   // ... rest of the scene ...
   return { frames: r.frames, scout };
   ```
   `scoutRects` returns, per name, `rect: [x, y, w, h]` and `focus: [x, y]` in **source px of the
   1080p take** (CSS px x 4/3, because the 1440 px wide page at DPR 2 is encoded 1920 wide) and `t`,
   the seconds since `record()` started. Target the element's **text** (`getByText`, a label), not
   its padded container: the cut pads the box by 15 and 9 px itself.
   Save what the run returned as `<demo>/recordings/scout/<NN-name>.json` (Write tool), e.g.
   `{"take": 1, "region": {"rect": [300, 120, 1320, 640], "t": 1.2}, "answer": {"rect": [1012, 598, 336, 44], "focus": [1180, 620], "t": 8.6}}`.

   | Measured | Goes into demo.json (skill `demo-edit`) |
   | --- | --- |
   | `region.rect` | scene `crop` (the engine widens it to 1.95:1) |
   | a target's `focus` | `zooms[].focus` |
   | a target's `rect` | `highlights[].rect` |
   | a target's `t` | `zooms[].at` is about `(t - trim_in) / speed - 1.1`, so the zoom lands as it appears |

   | If you see | Do this |
   | --- | --- |
   | `scout target answer is not visible` | Measure after its `waitFor`, or scroll it into view first |
   | a rect much wider than the text | You measured the container; use `getByText` or a tighter locator |
   | the element moves later in the take (a list grows, a filter reflows) | Measure again at the moment it is highlighted, under a second name |

Scene done when: one `keep` row, the recipe's verify list passed, THROWAWAYS.md updated, and
`recordings/scout/<NN-name>.json` holds every crop region and highlight target in its Edit plan row.

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
- [ ] No take shows a login form, a password field or a 2FA screen
- [ ] No password appears in any file in `<demo>` (only a gitignored `app/.env` the user asked for)
- [ ] THROWAWAYS.md lists everything created on camera
- [ ] Every scene has `recordings/scout/<NN-name>.json` with its crop region and highlight rects
- [ ] `_project.js` has `cursor: 'dot'` (the quality-bar cursor; an OS-style arrow fails the bar)
- [ ] Next: skill `demo-edit`, Step 1 (review reel)
