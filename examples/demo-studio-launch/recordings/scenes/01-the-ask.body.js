// The site's Start section: install commands, then the one-sentence prompt.
const p = findTab('demo-studio/'); await prep(p);
ensure(p, 'cyruspastelero.github.io/demo-studio');
await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
await sleep(1200);
await placeCursor(p, W * 0.78, H * 0.30);
stop = await record(p, 'tmp01');
await sleep(1300);
const cmd = p.locator('#start pre');
await glide(p, cmd, 0.42, 0.3);
await sleep(1500);
const say = p.locator('#start .say p');
await glide(p, say, 0.5, 0.75);
await sleep(600);
const scout = {
  ...await scoutRects(p, { region: p.locator('#start') }),
  ...await scoutRects(p, { commands: cmd }),
  ...await scoutRects(p, { prompt: say }),
};
await park(p, W * 0.80, H * 0.86);
await sleep(5200);
const r = await stop(); stop = null;
return { frames: r.frames, scout };
