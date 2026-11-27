// End-to-end check of the editor against a temp copy of examples/acme-invoice-bot with synthetic
// takes: open, trim (plain and shared shots), play, 9:16 framing, an outside edit, and a title-card
// render. Usage: npm run e2e -w app
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
    await page.locator('[data-shot-id="0:0:1"]').click();
    // No question: a shared shot used in several places changes in this video only by default.
    assert.match(await page.locator('[data-testid="ref-note"]').innerText(), /PROMO only/);
    await dragHandle(page, '0:0:1', 'right', -40);
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

  const textShot = () => readHandoff(folder).videos[1].scenes[5].shots[1];
  const stageRect = () => page.locator('[data-testid="stage"]').boundingBox();
  async function dragTo(locator, x, y, beforeUp) {
    const b = await locator.boundingBox();
    assert.ok(b, 'drag source is visible');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) await page.mouse.move(b.x + b.width / 2 + ((x - b.x - b.width / 2) * i) / 8, b.y + b.height / 2 + ((y - b.y - b.height / 2) * i) / 8);
    if (beforeUp) await beforeUp();
    await page.mouse.up();
  }

  await step('drags on-screen text and it snaps to the frame centre', async () => {
    await page.click('[data-testid="video-tab-HOW-TO"]');
    await page.locator('[data-shot-id="1:5:1"]').click();
    const box = page.locator('[data-testid="text-box"]');
    await waitFor(async () => (await box.textContent()) === 'It asks instead of guessing', 'the shot text on the stage');
    const stage = await stageRect();
    await dragTo(box, stage.x + stage.width / 2 + 3, stage.y + stage.height / 2 - 2, async () => {
      assert.ok(await page.locator('.snap-guide').count() >= 1, 'a snap guide shows while dragging');
    });
    const shot = await waitFor(() => textShot().text_pos, 'text_pos to be saved');
    assert.deepEqual(shot, [0.5, 0.5]);
    assert.equal(await page.locator('.snap-guide').count(), 0, 'guides go away on release');
  });

  await step('edits the text in place with a double-click', async () => {
    await page.locator('[data-testid="text-box"]').dblclick();
    await page.waitForSelector('[data-testid="text-edit"]');
    await page.keyboard.type('Key never leaves the bot');
    await page.keyboard.press('Enter');
    await waitFor(() => textShot().text === 'Key never leaves the bot', 'the new text to be saved');
    assert.equal(await page.locator('[data-testid="shot-text"]').inputValue(), 'Key never leaves the bot', 'inspector follows');
    // Esc throws the typing away, and does not save on the blur that follows.
    await page.locator('[data-testid="text-box"]').dblclick();
    await page.waitForSelector('[data-testid="text-edit"]');
    await page.keyboard.type('Not this');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    assert.equal(textShot().text, 'Key never leaves the bot', 'Esc cancels the edit');
    assert.equal(await page.locator('[data-testid="text-box"]').textContent(), 'Key never leaves the bot');
  });

  await step('resizes with the handle, nudges with arrows, and undoes', async () => {
    const handle = page.locator('[data-testid="text-resize"]');
    const h = await handle.boundingBox();
    await dragTo(handle, h.x + h.width / 2 + 40, h.y + h.height / 2);
    const size = await waitFor(() => textShot().text_size, 'text_size to be saved');
    assert.ok(size > 44, `size grew to ${size}`);
    await page.keyboard.press('Shift+ArrowRight');
    await waitFor(() => textShot().text_pos?.[0] > 0.5, 'the nudge to be saved');
    await page.keyboard.press('ControlOrMeta+z');
    await waitFor(() => textShot().text_pos?.[0] === 0.5, 'undo to move it back');
  });

  await step('resets the text to its default spot', async () => {
    await page.locator('[data-testid="text-box"]').click();
    await page.click('[data-testid="text-reset"]');
    await waitFor(() => !('text_pos' in textShot()) && !('text_size' in textShot()), 'text_pos and text_size to be cleared');
  });

  await step('adds text by double-clicking an empty frame', async () => {
    await page.locator('[data-shot-id="1:1:0"]').click();
    await waitFor(async () => (await page.locator('[data-testid="text-box"]').count()) === 0, 'a shot without text');
    const stage = await stageRect();
    await page.mouse.dblclick(stage.x + stage.width * 0.3, stage.y + stage.height * 0.2);
    await page.waitForSelector('[data-testid="text-edit"]');
    await page.keyboard.type('Setup takes a minute');
    await page.keyboard.press('Enter');
    const card = await waitFor(() => {
      const c = readHandoff(folder).videos[1].scenes[1].shots[0];
      return c.text ? c : null;
    }, 'the new text to be saved');
    assert.equal(card.text, 'Setup takes a minute');
    assert.ok(Math.abs(card.text_pos[0] - 0.3) < 0.01 && Math.abs(card.text_pos[1] - 0.2) < 0.01, `placed at ${card.text_pos}`);
    await page.click('[data-testid="video-tab-PROMO"]');
  });

  await step('lists a font dropped into fonts/ and saves it on the text', async () => {
    await page.click('[data-testid="video-tab-HOW-TO"]');
    await page.locator('[data-shot-id="1:5:1"]').click();
    await page.locator('[data-testid="text-box"]').click();
    mkdirSync(join(folder, 'fonts'), { recursive: true });
    copyFileSync(join(REPO, 'assets', 'fonts', 'FigtreeVariable.woff2'), join(folder, 'fonts', 'Brand Sans.woff2'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); // back from the terminal
    await waitFor(async () => (await page.locator('[data-testid="text-font"] option').allTextContents()).includes('Brand Sans'), 'the new font in the list');
    await page.selectOption('[data-testid="text-font"]', 'fonts/Brand Sans.woff2');
    await waitFor(() => textShot().text_font === 'fonts/Brand Sans.woff2', 'text_font to be saved');
    await waitFor(() => page.evaluate(() => document.fonts.check("44px 'dsf-fonts-Brand-Sans-woff2-b59e44fc'")), 'the font to load in the preview');
  });

  await step('exports the text on the same pixels as the preview', async () => {
    await page.evaluate(() => document.fonts.ready);
    const stage = await stageRect();
    const box = await page.locator('[data-testid="text-box"]').boundingBox();
    const k = stage.width / 1920;
    const shown = { x: (box.x - stage.x) / k, y: (box.y - stage.y) / k, w: box.width / k, h: box.height / k };
    const shot = textShot();
    const work = mkdtempSync(join(tmpdir(), 'text-overlay-'));
    writeFileSync(join(work, 'job.json'), JSON.stringify({ demo_dir: folder, out_dir: work, items: [
      { name: 'check', text: shot.text, pos: shot.text_pos ?? null, size: shot.text_size ?? null, font: shot.text_font ?? null }] }));
    const made = spawnSync(process.execPath, [join(REPO, 'scripts', 'text-overlays.mjs'), join(work, 'job.json')], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    const uri = `data:image/png;base64,${readFileSync(join(work, 'check.png')).toString('base64')}`;
    const drawn = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1;
      for (let y = 0; y < img.height; y += 1) {
        for (let x = 0; x < img.width; x += 1) {
          if (d[(y * img.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
      }
      return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }, uri);
    for (const key of ['x', 'y', 'w', 'h']) {
      assert.ok(Math.abs(drawn[key] - shown[key]) <= 1.5, `${key}: preview ${shown[key].toFixed(1)} vs export ${drawn[key]}`);
    }
    await page.click('[data-testid="video-tab-PROMO"]');
  });

  await step('the playhead head is a handle: hand cursors, a hover time, and drag to scrub', async () => {
    const ruler = page.locator('[data-testid="ruler"]');
    const r = await ruler.boundingBox();
    await page.mouse.move(r.x + 300, r.y + r.height / 2);
    assert.equal(await ruler.evaluate((el) => getComputedStyle(el).cursor), 'pointer');
    await page.waitForSelector('.tl-hover');
    const start = await page.textContent('[data-testid="timecode"]');
    await page.mouse.click(r.x + 300, r.y + r.height / 2); // a click on the ruler brings the playhead here
    assert.notEqual(await page.textContent('[data-testid="timecode"]'), start, 'clicking the ruler moves the playhead');
    const grip = page.locator('[data-testid="playhead-grip"]');
    assert.equal(await grip.evaluate((el) => getComputedStyle(el).cursor), 'grab');
    const before = await page.textContent('[data-testid="timecode"]');
    const g = await grip.boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2 + 120, g.y + g.height / 2, { steps: 6 });
    await page.mouse.up();
    assert.notEqual(await page.textContent('[data-testid="timecode"]'), before, 'dragging the head moves the playhead');
  });

  await step('edits a title card\'s words right on the preview', async () => {
    await page.click('[data-testid="video-tab-HOW-TO"]');
    await page.locator('[data-shot-id="1:1:0"]').click();
    await page.locator('[data-testid="card-title-line"]').dblclick();
    await page.waitForSelector('[data-testid="card-title-line-edit"]');
    await page.keyboard.type('Set it up in a minute');
    await page.keyboard.press('Enter');
    await waitFor(() => readHandoff(folder).cards['card-setup'].title === 'Set it up in a minute', 'the card title to be saved');
    assert.equal(await page.locator('[data-testid="card-title-line"]').innerText(), 'Set it up in a minute');
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
    await page.click('[data-testid="render-social"]'); // long: it builds the rough assemblies first
    await page.waitForSelector('[data-testid="render-drawer"][data-status="running"]');
    await page.click('[data-testid="render-drawer"] button:has-text("Cancel")');
    await page.waitForSelector('[data-testid="render-drawer"][data-status="cancelled"]', { timeout: 10000 });
  });

  await step('opens on demo.json while handoff.json is still the template', async () => {
    const fileTab = (k) => page.locator(`.topbar [role="tab"]:has-text("${k}.json")`);
    const banner = page.locator('[data-testid="template-banner"]');
    const real = readFileSync(join(folder, 'handoff.json'));
    writeFileSync(join(folder, 'handoff.json'), readFileSync(join(REPO, 'templates', 'handoff.json')));
    await page.reload();
    await page.waitForSelector('[data-testid="shot"]');
    assert.equal(await fileTab('demo').getAttribute('aria-selected'), 'true');
    assert.equal(await banner.count(), 0);

    // On the template tab the timeline says so and offers the real cut.
    await fileTab('handoff').click();
    assert.match(await banner.textContent(), /handoff\.json is still the template/);
    await page.click('[data-testid="template-switch"]');
    assert.equal(await fileTab('demo').getAttribute('aria-selected'), 'true');
    assert.equal(await banner.count(), 0);

    // Claude fills handoff.json in while it is open: the banner goes without a reload.
    await fileTab('handoff').click();
    await banner.waitFor();
    writeFileSync(join(folder, 'handoff.json'), real);
    await banner.waitFor({ state: 'detached' });

    // Both files still templates: handoff opens first, with no file to switch to.
    writeFileSync(join(folder, 'handoff.json'), readFileSync(join(REPO, 'templates', 'handoff.json')));
    writeFileSync(join(folder, 'demo.json'), readFileSync(join(REPO, 'templates', 'demo.json')));
    await page.reload();
    await banner.waitFor();
    assert.equal(await fileTab('handoff').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('[data-testid="template-switch"]').count(), 0);
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
