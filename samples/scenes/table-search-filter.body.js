// RECIPE: Search a table, then filter it, and show the rows narrowing.
// TEMPLATE: placeholder URLs and labels. Adapt it after a scout run on the real product.
// USE WHEN: finding one record in a list is the step (customers, orders, events, users).
// CHANGE: every line marked `// CHANGE:` below, including the take name in record().
//   Locators are by role and label; use the names the scout run returned.
// Seed data must make the result unambiguous: a known count before and after.
// VERIFY AFTER THE TAKE (on the contact sheet and the return value):
//   - the return value's `after` is smaller than `before`
//   - the matching row is visible and pointed at; no empty-state flash between steps
//   - the filter menu is closed before the tail hold
const URL = 'https://app.example.com/customers';  // CHANGE: the real page URL
const p = await tabFor('app.example.com/customers', URL);  // CHANGE: the URL part of the real page
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await prep(p);
const rows = p.getByRole('row');  // CHANGE: the real label from the scout run
await rows.nth(1).waitFor();
ensure(p, 'app.example.com/customers');  // CHANGE: the URL part of the real page
const total = await rows.count();
await placeCursor(p);
stop = await record(p, '_tmp08');  // CHANGE: '_tmp' + this scene's number, for example '_tmp04'
await sleep(1300);

// Search: type, then wait for the table to narrow (debounced searches lag a beat).
await click(p, p.getByRole('searchbox', { name: 'Search customers' }), 0.85);  // CHANGE: the real label from the scout run
await typeHuman(p, 'harbor', 70);  // CHANGE: the exact text from RUN-SHEET.md
for (let i = 0; i < 40 && await rows.count() >= total; i++) await sleep(250);
await sleep(900);

// Filter: open it, pick one value, close it.
await click(p, p.getByRole('button', { name: 'Plan' }));  // CHANGE: the real label from the scout run
await click(p, p.getByRole('menuitemcheckbox', { name: 'Business' }));  // CHANGE: the real label from the scout run
await p.keyboard.press('Escape');
const match = p.getByRole('row', { name: /Harbor Studio/ });  // CHANGE: the real label from the scout run
await match.waitFor({ timeout: 10000 });
await sleep(500);
await glide(p, match, 0.25, 0.5);                             // point at the record found
await sleep(1200);
await park(p);
await sleep(2500);
const r = await stop(); stop = null;
return { frames: r.frames, before: total, after: await rows.count() };
