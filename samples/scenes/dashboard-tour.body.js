// RECIPE: Dashboard tour with smooth scrolling and parking.
// TEMPLATE: placeholder URLs and labels. Adapt it after a scout run on the real product.
// USE WHEN: a long page (dashboard, report, landing page) is shown section by section.
// CHANGE: every line marked `// CHANGE:` below, including the take name in record().
//   Locators are by role and label; use the names the scout run returned.
// Rhythm: scroll, let it settle, point, park. Never point while scrolling.
// VERIFY AFTER THE TAKE (on the contact sheet and the return value):
//   - the scroll moves smoothly with no jumps; each section settles before the pointer moves
//   - the pointer never sits on the number the caption talks about
//   - no chart is still loading (spinner, empty axes) when the pointer reaches it
const URL = 'https://app.example.com/dashboard';  // CHANGE: the real page URL
const p = await tabFor('app.example.com/dashboard', URL);  // CHANGE: the URL part of the real page
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await prep(p);
await p.getByRole('heading', { name: 'Overview' }).waitFor();  // CHANGE: the real label from the scout run
ensure(p, 'app.example.com/dashboard');  // CHANGE: the URL part of the real page
await p.evaluate(() => window.scrollTo(0, 0));
await placeCursor(p);
stop = await record(p, '_tmp02');  // CHANGE: '_tmp' + this scene's number, for example '_tmp04'
await sleep(1400);

// The headline number: glide to it, hold, park.
await glide(p, p.getByRole('region', { name: 'Weekly active users' }), 0.5, 0.6);  // CHANGE: the real label from the scout run
await sleep(1200);
await park(p);
await sleep(900);

// Each section: bring it to about 30% from the top, then point at one thing.
const sections = ['Signups by channel', 'Retention', 'Top pages'];  // CHANGE: the real section headings
for (const name of sections) {
  await scrollIntoCenter(p, p.getByRole('heading', { name }));  // CHANGE: the real label from the scout run
  await sleep(600);                                           // settle before pointing
  await glide(p, p.getByRole('heading', { name }), 0.2, 0.5);  // CHANGE: the real label from the scout run
  await sleep(1100);
}

// A short wheel-like scroll back up reads more natural than a jump.
await smoothScroll(p, -900, 30);
await sleep(500);
await park(p, W * 0.8, H * 0.3);
await sleep(2600);
const r = await stop(); stop = null;
return { frames: r.frames, sections: sections.length };
