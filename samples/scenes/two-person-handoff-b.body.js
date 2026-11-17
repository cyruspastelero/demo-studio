// RECIPE: Two people, part B: the admin approves.
// TEMPLATE: placeholder URLs and labels. Adapt it after a scout run on the real product.
// USE WHEN: the second half of two-person-handoff-a. Run part A first.
// CHANGE: every line marked `// CHANGE:` below, including the take name in record().
//   Locators are by role and label; use the names the scout run returned.
// Record with: node "$P/scripts/rec.mjs" admin scenes/<NN-name>.body.js
// VERIFY AFTER THE TAKE (on the contact sheet and the return value):
//   - the request shown is the one part A created (same text)
//   - "Approved" is on screen at the end
//   - a part C (copy part A, wait for 'Approved') shows the result on the asker's side
const URL = 'https://app.example.com/admin/requests';  // CHANGE: the real page URL
const p = await tabFor('app.example.com/admin', URL);  // CHANGE: the URL part of the real page
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await prep(p);
const request = p.getByRole('listitem').filter({ hasText: 'revenue dashboard' }).first();  // CHANGE: the real label from the scout run
await request.waitFor({ timeout: 20000 });
ensure(p, 'app.example.com/admin/requests');  // CHANGE: the URL part of the real page
await placeCursor(p);
stop = await record(p, '_tmp09b');  // CHANGE: '_tmp' + this scene's number, for example '_tmp04'
await sleep(1200);

await glide(p, request, 0.3, 0.5);                            // let the viewer read who asked
await sleep(1200);
await click(p, request.getByRole('button', { name: 'Approve' }));  // CHANGE: the real label from the scout run
await request.getByText('Approved').waitFor({ timeout: 15000 });  // CHANGE: the real label from the scout run
await park(p);
await sleep(2600);
const r = await stop(); stop = null;
return { frames: r.frames };
