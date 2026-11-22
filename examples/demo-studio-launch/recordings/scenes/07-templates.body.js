// The site's look-templates section: six house frames, copy the look of any video, share as a folder.
const p = findTab('demo-studio/'); await prep(p);
ensure(p, 'cyruspastelero.github.io/demo-studio');
await p.evaluate(() => { const el = document.getElementById('templates'); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 40, behavior: 'instant' }); });
await sleep(2000);
await placeCursor(p, W * 0.80, H * 0.12);
stop = await record(p, 'tmp07');
await sleep(1000);
const imgs = p.locator('#templates .strip img');
for (const i of [0, 2, 4]) { await glide(p, imgs.nth(i), 0.5, 0.5); await sleep(350); }
const copy = p.getByText('Copy the look of any video', { exact: true });
const share = p.getByText('Share it as a folder', { exact: true });
await scrollIntoCenter(p, copy);
await sleep(900);
await glide(p, copy, 1.05, 0.5);
await sleep(500);
const scout = { ...await scoutRects(p, { copy, share, how: p.locator('#templates .how'), strip: p.locator('#templates .strip') }), scroll1: { t: null } };
await park(p, W * 0.86, H * 0.20);
await sleep(4500);
const r = await stop(); stop = null;
return { frames: r.frames, scout };
