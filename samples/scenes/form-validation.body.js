// RECIPE: Form fill with a validation error, then success.
// TEMPLATE: placeholder URLs and labels. Adapt it after a scout run on the real product.
// USE WHEN: a create, sign-up or settings form where the error message is part of the story.
// CHANGE: every line marked `// CHANGE:` below, including the take name in record().
//   Locators are by role and label; use the names the scout run returned.
// VERIFY AFTER THE TAKE (on the contact sheet and the return value):
//   - the error text appears and stays readable for about 2 seconds
//   - the pointer is parked off the form while the error and the result are on screen
//   - the new record's heading is visible before the tail hold
const URL = 'https://app.example.com/projects/new';  // CHANGE: the real page URL
const p = await tabFor('app.example.com/projects', URL);  // CHANGE: the URL part of the real page
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await prep(p);
await p.getByLabel('Project name').waitFor();  // CHANGE: the real label from the scout run
ensure(p, 'app.example.com/projects/new');  // CHANGE: the URL part of the real page
await placeCursor(p);
stop = await record(p, '_tmp04');  // CHANGE: '_tmp' + this scene's number, for example '_tmp04'
await sleep(1300);                                            // head handle

// 1. Fill the name, leave the required email empty, submit.
await click(p, p.getByLabel('Project name'), 0.85);           // CHANGE: the real label from the scout run. right end, so the text stays visible
await typeHuman(p, 'Spring launch');  // CHANGE: the exact text from RUN-SHEET.md
await sleep(500);
await click(p, p.getByRole('button', { name: 'Create project' }));  // CHANGE: the real label from the scout run
const error = p.getByText('Enter an owner email');  // CHANGE: the real label from the scout run
await error.waitFor({ timeout: 10000 });
await park(p);
await sleep(1800);                                            // let the viewer read the error

// 2. Fix it and submit again.
await click(p, p.getByLabel('Owner email'), 0.85);  // CHANGE: the real label from the scout run
await typeHuman(p, 'riley@example.com');  // CHANGE: the exact text from RUN-SHEET.md
await sleep(500);
await click(p, p.getByRole('button', { name: 'Create project' }));  // CHANGE: the real label from the scout run
const t0 = Date.now();
await p.getByRole('heading', { name: 'Spring launch' }).waitFor({ timeout: 20000 });  // CHANGE: the real label from the scout run
const createSeconds = (Date.now() - t0) / 1000;
await park(p);
await sleep(2600);                                            // tail handle
const r = await stop(); stop = null;
return { frames: r.frames, createSeconds, errorShown: await error.isVisible().catch(() => false) };
