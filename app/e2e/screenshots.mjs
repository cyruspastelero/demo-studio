// Screenshots for the README and for a layout check at common laptop sizes. Light is the default picture;
// the *-dark files show the dark theme. Usage: npm run screenshots -w app        (writes docs/img/studio-*.png)
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { exampleCopy, launch, REPO, startServer } from './harness.mjs';
import { homeFixture } from './home-fixture.mjs';

const OUT = join(REPO, 'docs', 'img');
const SHOTS = [
  { name: 'studio-1440', width: 1440, height: 900 },
  { name: 'studio-1280', width: 1280, height: 800 },
  { name: 'studio-9x16-1440', width: 1440, height: 900, aspect: '9x16' },
  { name: 'studio-render-1440', width: 1440, height: 900, render: true },
  { name: 'studio-shortcuts-1440', width: 1440, height: 900, shortcuts: true },
  { name: 'studio-1440-dark', width: 1440, height: 900, theme: 'dark' },
];
const HOME_SHOTS = [
  { name: 'studio-home-1440', width: 1440, height: 900 },
  { name: 'studio-home-390', width: 390, height: 844 },
  { name: 'studio-home-1440-dark', width: 1440, height: 900, theme: 'dark' },
];

// A page in a given theme, picked the way a user would (the stored choice), on a light device.
async function themedPage(shot) {
  const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height }, colorScheme: 'light' });
  const theme = shot.theme ?? 'light';
  await page.addInitScript((value) => { localStorage.setItem('demo-studio.theme', value); }, theme);
  return page;
}

async function homeShots() {
  const home = homeFixture();
  const homeServer = await startServer(null, 4627, { DEMO_ROOT: home.dir });
  try {
    for (const shot of HOME_SHOTS) {
      const page = await themedPage(shot);
      await page.goto(homeServer.url);
      await page.waitForSelector('[data-testid="demo-card"]');
      await page.evaluate(() => { document.querySelectorAll('.home-root').forEach((el) => { el.textContent = '~/demos'; }); });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
      await page.close();
      console.log(`wrote docs/img/${shot.name}.png`);
    }
  } finally {
    homeServer.stop();
    home.cleanup();
  }
}

const { folder, cleanup } = exampleCopy();
let server;
let browser;
try {
  const cards = spawnSync(process.execPath, [join(REPO, 'scripts', 'title-cards.mjs'), 'handoff.json'], { cwd: folder, stdio: 'ignore' });
  if (cards.status !== 0) throw new Error('title-cards.mjs failed');
  server = await startServer(folder, 4617);
  browser = await launch();
  mkdirSync(OUT, { recursive: true });
  for (const shot of SHOTS) {
    const page = await themedPage(shot);
    await page.goto(server.url);
    await page.waitForSelector('[data-testid="shot"]');
    await page.locator('[data-shot-id="0:1:1"]').click();
    await page.evaluate(() => document.querySelector('[data-testid="ruler"]'));
    if (shot.aspect) await page.click(`[data-testid="aspect-${shot.aspect}"]`);
    // Park the playhead inside the selected shot so the preview shows a frame and its on-screen text.
    const box = await page.locator('[data-shot-id="0:1:1"]').boundingBox();
    const ruler = await page.locator('[data-testid="ruler"]').boundingBox();
    if (box && ruler) await page.mouse.click(box.x + box.width * 0.4, ruler.y + ruler.height / 2);
    if (shot.render) {
      await page.click('[data-testid="render-button"]');
      await page.click('[data-testid="render-cards"]');
      await page.waitForSelector('[data-testid="render-drawer"][data-status="done"]', { timeout: 60000 });
    }
    if (shot.shortcuts) await page.keyboard.press('?');
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
    await page.close();
    console.log(`wrote docs/img/${shot.name}.png`);
  }
  await homeShots();
} catch (error) {
  console.error(`screenshots failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server?.stop();
  cleanup();
}
