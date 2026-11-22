// The site's Local and safe section: no account, secrets masked before capture.
const p = findTab('demo-studio/'); await prep(p);
ensure(p, 'cyruspastelero.github.io/demo-studio');
await p.evaluate(() => { const el = document.getElementById('local'); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 60, behavior: 'instant' }); });
await sleep(1200);
await placeCursor(p, W * 0.72, H * 0.20);
stop = await record(p, 'tmp05');
await sleep(1300);
const lead = p.locator('#local p.lead');
await glide(p, lead, 0.25, 0.3);
await sleep(1400);
const secrets = p.getByText('Secrets are masked before capture', { exact: true });
await glide(p, secrets, 0.9, 0.5);
await sleep(600);
const scout = { ...await scoutRects(p, { region: p.locator('#local'), lead: p.getByText('No demo-studio account, no cloud service, no telemetry.', { exact: false }), secrets, secretsBody: p.locator('#local dl.facts > div').nth(1) }) };
await park(p, W * 0.82, H * 0.30);
await sleep(5000);
const r = await stop(); stop = null;
return { frames: r.frames, scout };
