// The site's six-stage track: the pointer walks Plan to Hand off.
const p = findTab('demo-studio/'); await prep(p);
ensure(p, 'cyruspastelero.github.io/demo-studio');
await p.evaluate(() => { const el = document.getElementById('stages'); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 120, behavior: 'instant' }); });
await sleep(1200);
await placeCursor(p, W * 0.70, H * 0.22);
stop = await record(p, 'tmp02');
await sleep(1300);
const stages = p.locator('#stages ol.track li h3');
const scout = { ...await scoutRects(p, { region: p.locator('#stages') }) };
for (let i = 0; i < 6; i++) {
  await glide(p, stages.nth(i), 0.5, 0.6);
  await sleep(i === 2 ? 900 : 550);
}
Object.assign(scout, await scoutRects(p, { record: stages.nth(2), edit: stages.nth(4), track: p.locator('#stages ol.track') }));
await park(p, W * 0.80, H * 0.18);
await sleep(4500);
const r = await stop(); stop = null;
return { frames: r.frames, scout };
