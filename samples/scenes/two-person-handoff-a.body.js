// RECIPE: Two people, part A: the member asks.
// TEMPLATE: placeholder URLs and labels. Adapt it after a scout run on the real product.
// USE WHEN: a request passes between two people (request and approve, a chat between two users).
// CHANGE: every line marked `// CHANGE:` below, including the take name in record().
//   Locators are by role and label; use the names the scout run returned.
// Each person has their own Chrome window (open-window.sh) listed under demo.json "windows".
// Record with rec.mjs, not the MCP, from <demo>/recordings:
//   node "$P/scripts/rec.mjs" member scenes/<NN-name>.body.js
// To film both at once, give each window its own rx_port and run a second frame receiver.
// VERIFY AFTER THE TAKE (on the contact sheet and the return value):
//   - the request text matches RUN-SHEET.md exactly (part B looks for it)
//   - "Waiting for approval" (or your app's equivalent) is on screen at the end
const URL = 'https://app.example.com/requests/new';  // CHANGE: the real page URL
const p = await tabFor('app.example.com/requests', URL);  // CHANGE: the URL part of the real page
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await prep(p);
await p.getByLabel('What do you need?').waitFor();  // CHANGE: the real label from the scout run
ensure(p, 'app.example.com/requests/new');  // CHANGE: the URL part of the real page
await placeCursor(p);
stop = await record(p, '_tmp09a');  // CHANGE: '_tmp' + this scene's number, for example '_tmp04'
await sleep(1200);

await click(p, p.getByLabel('What do you need?'), 0.85);  // CHANGE: the real label from the scout run
await typeHuman(p, 'Access to the revenue dashboard for the board meeting', 45);  // CHANGE: the exact text from RUN-SHEET.md
await sleep(400);
await click(p, p.getByRole('button', { name: 'Send request' }));  // CHANGE: the real label from the scout run
await p.getByText('Waiting for approval').waitFor({ timeout: 15000 });  // CHANGE: the real label from the scout run
await park(p);
await sleep(2600);
const r = await stop(); stop = null;
return { frames: r.frames };
