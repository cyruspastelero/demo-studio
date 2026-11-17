// End-to-end check of the home screen: a temp demos folder holding a copy of the example with
// synthetic takes. Lists the demo with its stages and next step, opens it in the editor, comes back.
// Usage: node e2e/home.e2e.mjs      (the dashboard screenshots come from screenshots.mjs)
import assert from 'node:assert/strict';
import { FIXTURE_TEMPLATE, homeFixture } from './home-fixture.mjs';
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
  // The clipboard is stubbed, so the test reads what a Copy button wrote without browser permissions.
  await page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (text) => { window.__copied.push(text); } }, configurable: true,
    });
  });
  const copied = () => page.evaluate(() => window.__copied.at(-1));
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

  await step('shows a Templates tile and library counts', async () => {
    assert.match(await page.locator('[data-testid="stats"]').innerText(), /Templates/i);
    const count = await page.locator('.side [data-testid="nav-templates"] .nav-count').innerText();
    assert.ok(Number(count) >= 1, `templates count ${count}`);
  });

  await step('opens Prompts and copies a prompt without the placeholder markers', async () => {
    await page.click('.side [data-testid="nav-prompts"]');
    await page.waitForSelector('[data-testid="prompts-view"]');
    assert.equal(await page.getAttribute('.side [data-testid="nav-prompts"]', 'aria-current'), 'page');
    const reshoot = page.locator('[data-testid="prompt-card"][data-prompt="reshoot"]');
    assert.equal(await reshoot.locator('.prompt-ph').innerText(), '03');
    await reshoot.getByRole('button', { name: /^Copy prompt: Re-shoot scene 03/ }).click();
    assert.equal(await copied(), 'Re-shoot scene 03, the reply was slow.');
    await page.locator('[data-testid="copy-toast"]').getByText('Copied').waitFor();
  });

  await step('opens Templates: new-template prompt, the fixture card, copy id and use', async () => {
    await page.click('.side [data-testid="nav-templates"]');
    await page.waitForSelector('[data-testid="templates-view"]');
    await page.click('[data-testid="copy-copier"]');
    assert.match(await copied(), /^Make a template from ~\/Videos\/reference\.mp4: split it/);
    const tpl = page.locator(`[data-testid="template-card"][data-template="${FIXTURE_TEMPLATE.id}"]`);
    await tpl.waitFor();
    const text = await tpl.innerText();
    assert.match(text, /Warm keynote/);
    assert.match(text, /Yours/);
    assert.match(text, /Copied from reference\.mp4, 1:36/);
    assert.equal(await tpl.locator('.tpl-thumb').count(), 6);
    await tpl.locator('.tpl-preview').click();
    assert.equal(await tpl.locator('.tpl-thumb').nth(1).getAttribute('aria-pressed'), 'true', 'a click shows the next frame');
    assert.ok(await tpl.locator('.tpl-preview img').evaluate((img) => img.naturalWidth > 0), 'the preview PNG loads');
    await tpl.getByRole('button', { name: `Copy template id ${FIXTURE_TEMPLATE.id}` }).click();
    assert.equal(await copied(), FIXTURE_TEMPLATE.id);
    await tpl.locator('[data-testid="use-template"]').click();
    assert.equal(await copied(), `Make a demo of app.example.com using template ${FIXTURE_TEMPLATE.id}.`);
  });

  await step('the views have tabs and no sideways scroll at phone width', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.home-tabs [data-testid="nav-prompts"]').click();
    await page.waitForSelector('[data-testid="prompts-view"]');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.locator('.home-tabs [data-testid="nav-overview"]').click();
    await card.waitFor();
    await page.setViewportSize({ width: 1440, height: 900 });
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
