// RECIPE: Create an API key or token, with the secret masked in the page.
// TEMPLATE: placeholder URLs and labels. Adapt it after a scout run on the real product.
// USE WHEN: setup needs a credential on camera. Read $P/references/secrets.md first.
// CHANGE: every line marked `// CHANGE:` below, including the take name in record().
//   Locators are by role and label; use the names the scout run returned.
// Before this take: add the key's prefix to PROJECT.maskPatterns and its field label to
// PROJECT.maskLabels in _project.js. A secret drawn on a canvas or image needs blur().
// VERIFY AFTER THE TAKE (on the contact sheet and the return value):
//   - the return value's `caught` list shows the key's prefix (the mask found it)
//   - EVERY frame across the reveal shows the key blurred:
//     python3 -I "$P/scripts/tile-frames.py" frames/_tmpNN <from_s> <to_s> /tmp/check.png every=1 cols=6
//   - one unmasked frame is a leak: re-shoot, never patch it in post
//   - the key is listed in THROWAWAYS.md, to delete after sign-off
const URL = 'https://app.example.com/settings/keys';  // CHANGE: the real page URL
const p = await tabFor('app.example.com/settings', URL);  // CHANGE: the URL part of the real page
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await prep(p);
await maskSecrets(p);                                         // re-apply in case the page was open
await p.getByRole('button', { name: 'Create key' }).waitFor();  // CHANGE: the real label from the scout run
ensure(p, 'app.example.com/settings/keys');  // CHANGE: the URL part of the real page
await placeCursor(p);
stop = await record(p, '_tmp03');  // CHANGE: '_tmp' + this scene's number, for example '_tmp04'
await sleep(1200);

await click(p, p.getByRole('button', { name: 'Create key' }));  // CHANGE: the real label from the scout run
await click(p, p.getByLabel('Key name'), 0.85);  // CHANGE: the real label from the scout run
await typeHuman(p, 'Website tracking');  // CHANGE: the exact text from RUN-SHEET.md
await sleep(400);
await click(p, p.getByRole('radio', { name: 'Read only' }));  // CHANGE: the real label from the scout run. least privilege, on camera
await sleep(500);

const since = now();                                          // BEFORE the click that reveals it
await click(p, p.getByRole('button', { name: 'Generate' }));  // CHANGE: the real label from the scout run
await p.getByRole('button', { name: 'Copy' }).waitFor({ timeout: 15000 });  // CHANGE: the real label from the scout run
// A QR code or a canvas preview of the key? The DOM mask cannot see it:
// await blur(p.locator('canvas.key-qr'), since);
await sleep(1500);
const caught = await maskedSummary(p);                        // expect the key prefix here
await park(p);
await sleep(2200);
const r = await stop(); stop = null;
if (!caught.length) throw new Error('nothing was masked: add the key shape to PROJECT.maskPatterns and re-shoot');
return { frames: r.frames, caught, since };
