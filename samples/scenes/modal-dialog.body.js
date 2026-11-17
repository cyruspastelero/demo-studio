// RECIPE: Open a dialog, fill it, confirm, and show the result behind it.
// TEMPLATE: placeholder URLs and labels. Adapt it after a scout run on the real product.
// USE WHEN: an invite, share, delete-confirm or "new item" dialog is the step.
// CHANGE: every line marked `// CHANGE:` below, including the take name in record().
//   Locators are by role and label; use the names the scout run returned.
// Scope every locator to the dialog so you never click the page behind it.
// VERIFY AFTER THE TAKE (on the contact sheet and the return value):
//   - the dialog's open animation finished before the first click
//   - the dialog closed and the new row is visible and pointed at
//   - the invite or item is listed in THROWAWAYS.md
const URL = 'https://app.example.com/team';  // CHANGE: the real page URL
const p = await tabFor('app.example.com/team', URL);  // CHANGE: the URL part of the real page
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await prep(p);
await p.getByRole('button', { name: 'Invite member' }).waitFor();  // CHANGE: the real label from the scout run
ensure(p, 'app.example.com/team');  // CHANGE: the URL part of the real page
await placeCursor(p);
stop = await record(p, '_tmp06');  // CHANGE: '_tmp' + this scene's number, for example '_tmp04'
await sleep(1200);

await click(p, p.getByRole('button', { name: 'Invite member' }));  // CHANGE: the real label from the scout run
const dialog = p.getByRole('dialog', { name: 'Invite member' });  // CHANGE: the real label from the scout run
await dialog.waitFor();
await sleep(700);                                             // let the open animation finish
await click(p, dialog.getByLabel('Email'), 0.85);  // CHANGE: the real label from the scout run
await typeHuman(p, 'sam@example.com');  // CHANGE: the exact text from RUN-SHEET.md
await sleep(400);
await click(p, dialog.getByRole('combobox', { name: 'Role' }));  // CHANGE: the real label from the scout run
await click(p, p.getByRole('option', { name: 'Viewer' }));  // CHANGE: the real label from the scout run
await sleep(600);
await click(p, dialog.getByRole('button', { name: 'Send invite' }));  // CHANGE: the real label from the scout run
await dialog.waitFor({ state: 'hidden', timeout: 15000 });

// The proof: the new row in the page behind the dialog.
const row = p.getByRole('row', { name: /sam@example\.com/ });  // CHANGE: the real label from the scout run
await row.waitFor({ timeout: 15000 });
await glide(p, row, 0.3, 0.5);
await sleep(900);
await park(p);
await sleep(2600);
const r = await stop(); stop = null;
return { frames: r.frames };
