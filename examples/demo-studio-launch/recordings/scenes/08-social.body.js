// The live editor's aspect switch: 16:9, then 4:5, then 9:16.
const p = findTab('demo-studio/editor'); await prep(p);
await p.reload({ waitUntil: 'domcontentloaded' });
await p.getByTestId('play').waitFor();
await sleep(2500);
await prep(p);
// put the playhead on a frame with UI (scene 2) so the preview is not a blank card
await p.getByText('2. Tick off', { exact: true }).click();
await sleep(400);
const rb = await p.getByText('10s', { exact: true }).first().boundingBox();
await p.mouse.click(rb.x + 4, rb.y + rb.height / 2);
await sleep(1200);
await placeCursor(p, W * 0.60, H * 0.12);
stop = await record(p, 'tmp08');
await sleep(1000);
const r45 = p.getByRole('button', { name: '4:5', exact: true });
const r916 = p.getByRole('button', { name: '9:16', exact: true });
await click(p, r45);
await sleep(1500);
await click(p, r916);
await sleep(800);
await park(p, W * 0.80, H * 0.36);
await sleep(600);
const scout = { ...await scoutRects(p, { aspects: p.getByRole('button', { name: '16:9', exact: true }), r916, preview: p.locator('video, canvas').first() }) };
await sleep(3000);
const res = await stop(); stop = null;
return { frames: res.frames, scout };
