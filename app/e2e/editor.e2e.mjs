// End-to-end check of the editor against a temp copy of examples/acme-invoice-bot with synthetic
// takes: open, trim (plain and shared shots), play, 9:16 framing, an outside edit, and a title-card
// render. Usage: npm run e2e -w app
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exampleCopy, launch, REPO, startServer } from './harness.mjs';

const results = [];
async function step(name, fn) {
  const started = Date.now();
  await fn();
  results.push(name);
  console.log(`  ok  ${name} (${Date.now() - started} ms)`);
}

const readHandoff = (folder) => JSON.parse(readFileSync(join(folder, 'handoff.json'), 'utf8'));

async function waitFor(check, what, timeout = 10000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function dragHandle(page, shotId, side, dx) {
  const handle = page.locator(`[data-shot-id="${shotId}"] [data-testid="handle-${side}"]`);
  const box = await handle.boundingBox();
  assert.ok(box, `handle ${side} of ${shotId} is visible`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i += 1) await page.mouse.move(x + (dx * i) / 5, y);
  await page.mouse.up();
}

const { folder, cleanup } = exampleCopy();
let server;
let browser;
try {
  server = await startServer(folder);
  browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await step('opens the example', async () => {
    await page.goto(server.url);
    await page.waitForSelector('[data-testid="shot"]');
    assert.equal(await page.locator('[data-testid="shot"]').count(), 7);
    assert.equal(await page.locator('[data-testid="vo-bar"]').count(), 5);
  });

  await step('switches theme from the top bar', async () => {
    await page.click('.topbar [data-testid="theme-dark"]');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('demo-studio.theme')), 'dark');
    await page.click('.topbar [data-testid="theme-system"]');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'system');
  });

  await step('trims a plain clip and saves handoff.json', async () => {
    await page.click('[data-testid="video-tab-HOW-TO"]');
    const before = readHandoff(folder).videos[1].scenes[1].shots[1].out;
    await dragHandle(page, '1:1:1', 'right', -60);
    const after = await waitFor(() => {
      const out = readHandoff(folder).videos[1].scenes[1].shots[1].out;
      return out < before ? out : null;
    }, 'handoff.json to change');
    assert.ok(after >= 0.8 && after < before, `out moved from ${before} to ${after}`);
    assert.equal(readHandoff(folder)._comment.startsWith('Fictional example'), true, '_comment kept');
  });

  await step('trims a shared shot for this video only', async () => {
    await page.click('[data-testid="video-tab-PROMO"]');
    await dragHandle(page, '0:0:1', 'right', -40);
    await page.click('[data-testid="ref-override"]');
    const shot = await waitFor(() => {
      const s = readHandoff(folder).videos[0].scenes[0].shots[1];
      return s.out !== undefined ? s : null;
    }, 'the override to be saved');
    assert.equal(shot.ref, 'THREAD');
    assert.ok(shot.out < 9);
    assert.equal(readHandoff(folder).shots.THREAD.out, 9, 'shared shot untouched');
  });

  await step('plays and the video time advances', async () => {
    await page.locator('[data-shot-id="0:1:0"]').click();
    const start = await page.evaluate(() => {
      const v = [...document.querySelectorAll('video')].find((e) => e.style.visibility === 'visible');
      return v ? v.currentTime : -1;
    });
    await page.click('[data-testid="play"]');
    await page.waitForTimeout(1200);
    const now = await page.evaluate(() => {
      const v = [...document.querySelectorAll('video')].find((e) => e.style.visibility === 'visible');
      return v ? v.currentTime : -1;
    });
    await page.keyboard.press('k');
    assert.ok(start >= 0, 'a video is showing');
    assert.ok(now > start + 0.5, `currentTime went from ${start} to ${now}`);
    const tc = await page.textContent('[data-testid="timecode"]');
    assert.notEqual(tc?.split('/')[0].trim(), '0:00.00');
  });

  await step('views a raw take in the source viewer and returns to the cut', async () => {
    const cutBefore = await page.textContent('[data-testid="timecode"]');
    const take = page.locator('[data-testid="bin-take"][data-take="01-the-thread-t1.mp4"]');
    const binLength = Number.parseFloat((await take.locator('.meta span').first().textContent()) ?? '');
    await take.click();
    await page.waitForSelector('[data-testid="source-viewer"]');
    assert.match((await page.textContent('[data-testid="source-label"]')) ?? '', /Raw take.*01-the-thread-t1\.mp4/);
    const shown = await waitFor(async () => {
      const text = await page.textContent('[data-testid="source-duration"]');
      return text && text !== '-' ? text : null;
    }, 'the take duration');
    const [m, s] = shown.split(':');
    assert.ok(Math.abs(Number(m) * 60 + Number(s) - binLength) < 0.1, `duration ${shown} matches the bin's ${binLength}s`);
    assert.equal(await page.locator('[data-testid="source-set-in"]').count(), 0, 'no Set in without a shot of this take selected');
    await page.click('[data-testid="source-play"]');
    await page.waitForTimeout(1200);
    const played = await page.locator('[data-testid="source-video"]').evaluate((v) => v.currentTime);
    assert.ok(played > 0.5, `the take played to ${played}s`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="source-viewer"]', { state: 'detached' });
    assert.equal(await page.textContent('[data-testid="timecode"]'), cutBefore, 'the cut playhead is where it was');
    await waitFor(async () => (await page.evaluate(() => document.activeElement?.getAttribute('data-take'))) === '01-the-thread-t1.mp4', 'focus back on the take', 2000);
  });

  await step('opens a take with Enter and sets the selected shot in point with I', async () => {
    await page.click('[data-testid="video-tab-HOW-TO"]');
    await page.locator('[data-shot-id="1:2:0"]').click();
    await page.locator('[data-testid="bin-take"][data-take="03-add-key-t1.mp4"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="source-set-in"]');
    await page.locator('[data-testid="source-video"]').evaluate((v) => new Promise((resolve) => {
      v.addEventListener('seeked', resolve, { once: true });
      v.currentTime = 2.5;
    }));
    await page.keyboard.press('i');
    await waitFor(() => readHandoff(folder).videos[1].scenes[2].shots[0].in === 2.5, 'the in point to be saved');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="source-viewer"]', { state: 'detached' });
  });

  await step('drags a raw take onto the timeline without opening it', async () => {
    const count = () => readHandoff(folder).videos[1].scenes[2].shots.length;
    const before = count();
    await page.locator('[data-testid="bin-take"][data-take="03-add-key-t1.mp4"]').dragTo(page.locator('[data-shot-id="1:2:0"]'));
    await waitFor(() => count() === before + 1, 'the dropped shot to be saved');
    assert.equal(await page.locator('[data-testid="source-viewer"]').count(), 0);
    await page.click('[data-testid="video-tab-PROMO"]');
  });

  await step('frames 9:16 like social-cut.py', async () => {
    await page.click('[data-testid="aspect-9x16"]');
    const stage = await page.locator('[data-testid="stage"]').evaluate((el) => ({ w: el.style.width, h: el.style.height }));
    assert.deepEqual(stage, { w: '1080px', h: '1920px' });
    // PROMO 9:16 in the example: contain, so a 1000x562 window at (40, 759) under a 420px band.
    const win = await page.locator('[data-testid="window"]').evaluate((el) => [el.style.left, el.style.top, el.style.width, el.style.height]);
    assert.deepEqual(win, ['40px', '759px', '1000px', '562px']);
    assert.equal(await page.locator('[data-testid="caption-band"]').evaluate((el) => el.style.height), '420px');
    await page.click('[data-testid="aspect-16x9"]');
  });

  await step('reloads after an outside edit', async () => {
    const doc = readHandoff(folder);
    writeFileSync(join(folder, 'handoff.json'), JSON.stringify({ ...doc, title: 'Edited by Claude' }, null, 2));
    await page.waitForSelector('[data-testid="toast"]:has-text("changed outside the app")', { timeout: 5000 });
  });

  await step('renders title cards with progress and output', async () => {
    await page.click('[data-testid="render-button"]');
    await page.click('[data-testid="render-cards"]');
    await page.waitForSelector('[data-testid="render-drawer"][data-status="done"]', { timeout: 60000 });
    const progress = await page.textContent('[data-testid="render-stage"]');
    assert.match(progress ?? '', /title-cards 5\/5/);
    const loaded = await page.locator('[data-testid="render-output"] img').first().evaluate((img) => img.complete && img.naturalWidth);
    assert.equal(loaded, 1920, 'the rendered card loads in the drawer');
    assert.ok(existsSync(join(folder, 'recordings/editor-handoff/assets/title-cards/card-open.png')));
    // The preview now uses the rendered PNG for cards.
    await page.locator('[data-shot-id="0:0:0"]').click();
    await page.waitForSelector('[data-testid="window"] img');
  });

  await step('quick preview renders the current video at 960x540', async () => {
    await page.click('[data-testid="render-button"]');
    await page.click('[data-testid="render-quick"]');
    await page.waitForSelector('[data-testid="render-drawer"][data-status="done"]', { timeout: 60000 });
    const size = await page.locator('[data-testid="render-output"] video').evaluate((v) => new Promise((resolve) => {
      if (v.videoWidth) resolve([v.videoWidth, v.videoHeight]);
      v.addEventListener('loadedmetadata', () => resolve([v.videoWidth, v.videoHeight]), { once: true });
      v.addEventListener('error', () => resolve(['error', v.error?.message]), { once: true });
      setTimeout(() => resolve(['timeout', v.currentSrc]), 8000);
    }));
    assert.deepEqual(size, [960, 540]);
  });

  await step('cancels a running render', async () => {
    await page.click('[data-testid="render-button"]');
    await page.click('[data-testid="render-handoff"]');
    await page.waitForSelector('[data-testid="render-drawer"][data-status="running"]');
    await page.click('[data-testid="render-drawer"] button:has-text("Cancel")');
    await page.waitForSelector('[data-testid="render-drawer"][data-status="cancelled"]', { timeout: 10000 });
  });

  await step('opens on demo.json while handoff.json is still the template', async () => {
    const fileTab = (k) => page.locator(`.topbar [role="tab"]:has-text("${k}.json")`);
    writeFileSync(join(folder, 'handoff.json'), readFileSync(join(REPO, 'templates', 'handoff.json')));
    await page.reload();
    await page.waitForSelector('[data-testid="shot"]');
    assert.equal(await fileTab('demo').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('[data-testid="template-notice"]').count(), 0);
    await fileTab('handoff').click();
    const notice = await page.locator('[data-testid="template-notice"]').textContent();
    assert.match(notice, /handoff\.json is still the template.*switch to demo\.json/);
  });

  assert.deepEqual(errors, [], `no page errors: ${errors.join('; ')}`);
  console.log(`\ne2e passed (${results.length} steps)`);
} catch (error) {
  console.error(`\ne2e FAILED: ${error.message}`);
  if (server) console.error(`server log:\n${server.log()}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server?.stop();
  cleanup();
}
