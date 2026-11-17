// End-to-end check of the home screen: a temp demos folder holding a copy of the example with
// synthetic takes. Lists the demo with its stages and next step, opens it in the editor, comes back.
// Usage: node e2e/home.e2e.mjs      (the dashboard screenshots come from screenshots.mjs)
import assert from 'node:assert/strict';
import { homeFixture } from './home-fixture.mjs';
import { launch, startServer } from './harness.mjs';

const { dir, cleanup } = homeFixture();
let server;
let browser;
let passed = 0;
async function step(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

try {
  server = await startServer(null, 4527, { DEMO_ROOT: dir });
  browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(server.url);

  const card = page.locator('[data-testid="demo-card"][data-demo="acme-invoice-bot"]').first();
  await step('lists the demo with its title and index status', async () => {
    await card.waitFor();
    assert.match(await card.innerText(), /Acme Invoice Bot/);
    assert.equal(await card.locator('.demo-status').innerText(), 'Review');
  });

  await step('shows the stages done so far and the next one', async () => {
    assert.deepEqual(await card.locator('.stage-track li.done .stage-label').allInnerTexts().then((t) => t.map((s) => s.split('\n')[0].trim().replace(/ \(done\)$/, ''))),
      ['Plan', 'Prep', 'Record', 'Review']);
    assert.match(await card.locator('.demo-next-prompt').innerText(), /Cut the promo/);
  });

  await step('does not scroll sideways at phone width', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await step('switches theme, keeps the choice across a reload', async () => {
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    assert.equal(await theme(), 'system', 'defaults to system');
    await page.click('.side [data-testid="theme-dark"]');
    assert.equal(await theme(), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('demo-studio.theme')), 'dark');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(17, 17, 17)');
    await page.reload();
    await card.waitFor();
    assert.equal(await theme(), 'dark', 'set before paint from storage');
    assert.equal(await page.getAttribute('.side [data-testid="theme-dark"]', 'aria-checked'), 'true');
    await page.click('.side [data-testid="theme-light"]');
    assert.equal(await theme(), 'light');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(250, 250, 250)');
    await page.click('.side [data-testid="theme-system"]');
    assert.equal(await page.evaluate(() => localStorage.getItem('demo-studio.theme')), 'system');
  });

  await step('opens the demo in the editor and comes back', async () => {
    await card.locator('[data-testid="demo-item"]').click();
    await page.waitForSelector('[data-testid="shot"]');
    await page.click('[data-testid="close-demo"]');
    await page.waitForSelector('[data-testid="demo-card"]');
  });

  assert.deepEqual(errors, [], `no page errors: ${errors.join('; ')}`);
  console.log(`\nhome e2e passed (${passed} steps)`);
} catch (error) {
  console.error(`\nhome e2e FAILED: ${error.message}`);
  if (server) console.error(`server log:\n${server.log()}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server?.stop();
  cleanup();
}
