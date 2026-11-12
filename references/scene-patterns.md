# Scene patterns

A scene body is plain JS that runs inside `async (page) => { PROJECT; lib.js; let stop; try { BODY } finally { stop?.() } }`.
Assign `stop = await record(p, '_tmpNN')` so a crash still flushes the take, and `return` a small
summary object: frame count, latencies, and anything you need to verify.

Take names start with `_tmp`. `encode-take.sh` renames the frames to `<scene>-t<N>` when it encodes.
`P` below means the plugin root (`${CLAUDE_PLUGIN_ROOT}`).

Helpers from `lib.js`: `sleep, W, H, findTab, openTab, tabFor, ensure, prep, hideClutter, record,
now, blur, blurRect, glide, tap, click, typeHuman, smoothScroll, scrollIntoCenter, park,
maskSecrets, maskedSummary`.

## Skeleton

```js
const p = await tabFor('example.com/dashboard', 'https://example.com/dashboard');
await p.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
await prep(p);                       // viewport, cursor, mask, clutter
await sleep(2500);
ensure(p, 'example.com/dashboard');  // fail fast if we got redirected (login, wrong page)
await placeCursor(p);                // resting spot, set off camera
stop = await record(p, '_tmp02');
await sleep(1200);                   // head handle
await click(p, p.getByRole('button', { name: 'New project' }));
await sleep(900);
await click(p, p.getByLabel('Name'), 0.2);
await typeHuman(p, 'acme-launch');
await sleep(600);
await click(p, p.getByRole('button', { name: 'Create' }));
await p.getByText('Project created').waitFor({ timeout: 20000 });
await park(p);
await sleep(2500);                   // tail handle
const r = await stop(); stop = null;
return { frames: r.frames };
```

## Secret reveal (key or token creation)

```js
await maskSecrets(p);                                  // re-apply in case the page was already open
const since = now();                                    // BEFORE the click that reveals it
await click(p, p.getByRole('button', { name: 'Create key' }));
// canvas or image secrets the DOM mask cannot catch:
// await blur(p.locator('.key-canvas'), since);
await sleep(2000);
const caught = await maskedSummary(p);                 // expect the token prefix here
await park(p); await sleep(1800);
const r = await stop(); stop = null;
return { frames: r.frames, caught };
```

Then QA every frame across the reveal:

```bash
python3 "$P/scripts/tile-frames.py" frames/_tmp05 8 14 /tmp/check.png every=1 cols=6 crop=1400:500:700:600
```

## Long text into a form (manifest, config, code)

Typing 60 lines looks bad. Paste instead:

```js
await click(p, editor, 0.3, 0.2);
await p.keyboard.press('Meta+A');
await p.evaluate(t => navigator.clipboard.writeText(t), MANIFEST).catch(() => {});
await p.keyboard.press('Meta+V');
// or: await editor.fill(MANIFEST) when the clipboard is blocked
```

## Typing into a web composer (chat apps, AI chat boxes)

Rich text composers lose focus after popovers and sends. Confirm focus before typing:

```js
const composer = p.locator('[contenteditable="true"]').first();
await click(p, composer, 0.12);
const focused = await composer.evaluate(el => el.contains(document.activeElement));
if (!focused) throw new Error('composer not focused; keystrokes would hit page shortcuts');
await typeHuman(p, 'Northwind signed off on the redesign. $5,000 flat, due in two weeks.', 45);
await p.keyboard.press('Enter');
```

## Chat app: mention a bot in a thread and wait for its reply

Selectors differ per app; scout them first. The shape:

```js
const msg = p.locator('[data-qa="message_container"]').filter({ hasText: 'signed off' }).last();
await click(p, msg.locator('button[aria-label*="Reply in thread"]').first());
const pane = p.locator('[role="complementary"]');
await click(p, pane.locator('[contenteditable="true"]').first(), 0.25);
await typeHuman(p, '@Acme', 75); await sleep(1000); await p.keyboard.press('Tab');   // pick the mention
await typeHuman(p, ' send an invoice to '); await typeHuman(p, '@Jordan', 75); await sleep(1000); await p.keyboard.press('Tab');
await p.keyboard.press('Enter');
const t0 = Date.now();
await pane.getByRole('button', { name: 'Approve' }).last().waitFor({ timeout: 40000 });
const replySeconds = (Date.now() - t0) / 1000;
```

Typical chat clutter for `PROJECT.clutter`: `'Enable notifications'`, `'Without notifications'`,
`'^\\W*Unread mentions$'`.

## Opening a link the app produced (payment page, share link)

```js
const href = await pane.getByRole('link', { name: 'Pay invoice' }).last().getAttribute('href');
const pay = await openTab(href);
await sleep(5000); await prep(pay);
stop = await record(pay, '_tmp11');
```

## File upload (Playwright MCP)

The MCP intercepts file choosers, and it only uploads files under the session cwd. Copy the file
into the demo folder first. Record up to the click, end the run, upload, then record the rest:

```js
// scene 06a: ends right after the click that opens the chooser
await click(p, p.getByRole('button', { name: 'Upload contract' }));
await sleep(800);
const r = await stop(); stop = null;
return { frames: r.frames };
```

Then call `browser_file_upload` with the absolute path, and continue in scene 06b. The editor joins
06a and 06b; the gap is invisible because the chooser dialog never paints in the screencast.

## Deterministic answers from a local helper server

When the app shows random content (quiz questions), ask a localhost helper which option to click:

```js
const question = (await p.locator('h2').first().innerText()).trim();
const res = await api.get(`http://127.0.0.1:8766/answer?q=${encodeURIComponent(question.slice(0, 60))}`);
const { answer } = await res.json();
if (!answer) throw new Error(`no answer key for: ${question}`);
await click(p, p.getByRole('button', { name: new RegExp(`^${answer}\\b`) }));
```

The helper is demo-only code in `<demo>/tools/`, binds to 127.0.0.1, and reads from the seeded data.

## Terminal or console (canvas)

The text check fails on a canvas, so verify with a screenshot. Trim idle output in the edit
(`trim` in demo.json, `in`/`out` in handoff.json) instead of recording less. Terminals repaint
constantly; the receiver caps them.

## Scrolling a long page

`smoothScroll(p, 380, 30)` for wheel-like motion, or `scrollIntoCenter(p, loc)` for a smooth
programmatic scroll that lands the element about 30% from the top.

## Two people, two windows (rec.mjs)

```bash
bash "$P/scripts/open-window.sh" riley 9333 https://chat.example.com   # log in by hand once
bash "$P/scripts/open-window.sh" admin 9334 https://chat.example.com
cd recordings
node "$P/scripts/frame-receiver.mjs" . &                  # one receiver per rx_port (DEMO_RX_PORT=8766 for the second)
node "$P/scripts/rec.mjs" riley scenes/04-ask-bot.body.js
node "$P/scripts/rec.mjs" admin scenes/05-approve.body.js
```

Windows are listed in demo.json: `"windows": {"riley": {"port": 9333, "match": "chat.example.com", "rx_port": 8765}}`.
The scene bodies are the same as MCP scenes. Part files (shared selectors) can be passed before the body.

## Scout run (no recording)

Before writing a scene for an unfamiliar UI, run a body that returns locator facts and a screenshot:

```js
const p = findTab('example.com'); await prep(p);
await p.screenshot({ path: `${PROJECT.scratch || '/tmp'}/scout.png` });
return await p.getByRole('button').evaluateAll(bs => bs.map(b => b.innerText.trim()).filter(Boolean).slice(0, 60));
```
