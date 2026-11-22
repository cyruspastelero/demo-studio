// The site's opening: what demo-studio is, in one headline.
const p = findTab('demo-studio/'); await prep(p);
ensure(p, 'cyruspastelero.github.io/demo-studio');
await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await sleep(1200);
await placeCursor(p, W * 0.80, H * 0.62);
stop = await record(p, 'tmp06');
await sleep(1200);
const h1 = p.locator('.hero h1');
await glide(p, h1, 0.85, 0.75);
await sleep(900);
const btn = p.locator('.hero .actions a.btn');
await glide(p, btn, 0.5, 0.5);
await sleep(700);
const scout = { ...await scoutRects(p, { region: p.locator('.hero'), h1, intro: p.locator('.hero .intro'), install: btn, brand: p.locator('header.top .brand') }) };
await park(p, W * 0.80, H * 0.55);
await sleep(3500);
const r = await stop(); stop = null;
return { frames: r.frames, scout };
