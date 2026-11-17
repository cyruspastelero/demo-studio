// RECIPE: Type into a chat or AI composer, send, and wait for the reply.
// TEMPLATE: placeholder URLs and labels. Adapt it after a scout run on the real product.
// USE WHEN: the hero moment is an assistant or bot answering (AI chat, support bot, copilot).
// CHANGE: every line marked `// CHANGE:` below, including the take name in record().
//   Locators are by role and label; use the names the scout run returned.
// Never a fixed sleep: replies take different times. Trim the wait in the edit instead.
// VERIFY AFTER THE TAKE (on the contact sheet and the return value):
//   - the typed text appears in the composer (focus was right), not as page shortcuts
//   - the full reply is on screen and readable for about 3 seconds at the end
//   - replySeconds is noted in takes.csv so the wait can be trimmed in the edit
//   - the reply says only what the claims list allows; if not, re-ask or re-seed
const URL = 'https://app.example.com/assistant';  // CHANGE: the real page URL
const p = await tabFor('app.example.com/assistant', URL);  // CHANGE: the URL part of the real page
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await prep(p);
const composer = p.getByRole('textbox', { name: 'Ask a question' });  // CHANGE: the real label from the scout run
await composer.waitFor();
ensure(p, 'app.example.com/assistant');  // CHANGE: the URL part of the real page
await placeCursor(p);
stop = await record(p, '_tmp05');  // CHANGE: '_tmp' + this scene's number, for example '_tmp04'
await sleep(1300);

await click(p, composer, 0.12);
// Rich composers lose focus after popovers; check before typing or keys hit page shortcuts.
const focused = await composer.evaluate(el => el.contains(document.activeElement) || el === document.activeElement);
if (!focused) throw new Error('composer not focused; keystrokes would hit page shortcuts');
// Read like a real person with a goal. Long prompts: paste (see scene-patterns.md) instead.
await typeHuman(p, 'Which channel brought the most signups last week, and how does it compare to the week before?', 45);  // CHANGE: the exact text from RUN-SHEET.md
await sleep(500);
await p.keyboard.press('Enter');

const t0 = Date.now();
await park(p, W * 0.85, H * 0.25);                            // out of the reply's way while it streams
const reply = p.getByRole('article').last();  // CHANGE: the real label from the scout run
await reply.getByRole('button', { name: 'Copy' }).waitFor({ timeout: 60000 });  // CHANGE: the real label from the scout run
const replySeconds = (Date.now() - t0) / 1000;               // note it in takes.csv for the trim
await sleep(800);
await scrollIntoCenter(p, reply);
await sleep(2800);                                            // long enough to read the answer
const r = await stop(); stop = null;
return { frames: r.frames, replySeconds };
