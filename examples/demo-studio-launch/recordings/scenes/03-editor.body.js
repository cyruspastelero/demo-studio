// The live editor (server-less replay on the todo sample): play, scrub, pick a scene, add words to its voiceover line.
const p = findTab('demo-studio/editor'); await prep(p);
await p.reload({ waitUntil: 'domcontentloaded' });   // fresh state: edits live only in the tab
await p.getByTestId('play').waitFor();
await sleep(2500);
await prep(p);
ensure(p, 'demo-studio/editor');
await placeCursor(p, W * 0.55, H * 0.45);
stop = await record(p, 'tmp03');
await sleep(1200);
await click(p, p.getByTestId('play'));
await sleep(3800);
const pauseBtn = p.getByRole('button', { name: /pause/i });
if (await pauseBtn.count()) await click(p, pauseBtn.first()); else await click(p, p.getByTestId('play'));
await sleep(700);
// scrub: drag along the ruler from about 4 s to 15 s
const ruler = p.getByText('4s', { exact: true }).first();
const rb = await ruler.boundingBox();
const y = rb.y + rb.height / 2;
await moveHuman(p, rb.x, y);
await sleep(300);
await p.mouse.down();
const t0 = Date.now();
const x1 = rb.x + 11 * 36;
for (let i = 1; i <= 45; i++) { await p.mouse.move(rb.x + (x1 - rb.x) * (i / 45), y); await sleep(33); }
await p.mouse.up();
p.__mouseNote = Date.now() - t0;
await sleep(900);
const scoutA = await scoutRects(p, { preview: p.locator('video, canvas').first() });
// pick scene 2 on the timeline
await click(p, p.getByText('2. Tick off', { exact: true }), 0.3, 0.5);
const area = p.locator('textarea').first();
await area.waitFor();
await sleep(1100);
const readout = p.getByText(/words, about/).first();
const before = await readout.innerText();
await click(p, area, 0.75, 0.45);
await p.keyboard.press('Meta+ArrowDown');
await sleep(400);
await typeHuman(p, ' Then clear the rest in one click.', 60);
await sleep(500);
await park(p, W * 0.70, H * 0.93);
await sleep(600);
const scout = { ...scoutA, ...await scoutRects(p, { voiceover: area, readout, scene2: p.getByText('2. Tick off', { exact: true }), inspector: p.getByText('Scene 2', { exact: true }) }) };
await sleep(4200);
const r = await stop(); stop = null;
return { frames: r.frames, before, after: await readout.innerText(), scout };
