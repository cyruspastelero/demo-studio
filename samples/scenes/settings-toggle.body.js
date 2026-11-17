// RECIPE: Flip a setting and show the before and after.
// TEMPLATE: placeholder URLs and labels. Adapt it after a scout run on the real product.
// USE WHEN: a switch changes something visible and the viewer must see the effect, not just the switch.
// CHANGE: every line marked `// CHANGE:` below, including the take name in record().
//   Locators are by role and label; use the names the scout run returned.
// VERIFY AFTER THE TAKE (on the contact sheet and the return value):
//   - the return value's `before` and `after` differ
//   - the pointer rests on the same spot before and after, so the change is easy to compare
//   - no "Saved" toast shows (add its text to PROJECT.clutter)
//   - the reset script turns the switch back off before the next take
const URL = 'https://app.example.com/settings/reports';  // CHANGE: the real page URL
const p = await tabFor('app.example.com/settings', URL);  // CHANGE: the URL part of the real page
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await prep(p);
const toggle = p.getByRole('switch', { name: 'Hide test traffic' });  // CHANGE: the real label from the scout run
await toggle.waitFor();
ensure(p, 'app.example.com/settings/reports');  // CHANGE: the URL part of the real page
if (await toggle.getAttribute('aria-checked') === 'true') throw new Error('switch is already on: run the reset script');
await placeCursor(p);
stop = await record(p, '_tmp07');  // CHANGE: '_tmp' + this scene's number, for example '_tmp04'
await sleep(1200);

// Before: point at the number the setting will change.
const preview = p.getByRole('region', { name: 'Preview' });  // CHANGE: the real label from the scout run
await glide(p, preview.getByText(/visits/i).first(), 0.5, 0.5);  // CHANGE: the real label from the scout run
await sleep(1200);
const before = (await preview.innerText()).slice(0, 80);

// Flip it.
await click(p, toggle);
await toggle.and(p.locator('[aria-checked="true"]')).waitFor({ timeout: 10000 });
await sleep(500);
// If the page needs a Save button: await click(p, p.getByRole('button', { name: 'Save' }));  // CHANGE: the real label from the scout run

// After: the same spot, so the viewer compares like with like.
await glide(p, preview.getByText(/visits/i).first(), 0.5, 0.5);  // CHANGE: the real label from the scout run
await sleep(1400);
const after = (await preview.innerText()).slice(0, 80);
await park(p);
await sleep(2400);
const r = await stop(); stop = null;
if (before === after) throw new Error('the preview did not change: the effect is not on screen');
return { frames: r.frames, before, after };
