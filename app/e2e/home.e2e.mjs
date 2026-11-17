// End-to-end check of the home screen: a temp demos folder holding a copy of the example with
// synthetic takes. Lists the demo with its stages and next step, opens it in the editor, comes back.
// Usage: node e2e/home.e2e.mjs      (HOME_SHOT=1 also writes docs/img/studio-home-1440.png and studio-home-390.png)
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exampleCopy, launch, REPO, startServer } from './harness.mjs';

const INDEX = `# Demos

| Demo | What it shows | Status | Final cut |
| --- | --- | --- | --- |
| [acme-invoice-bot](acme-invoice-bot/README.md) | A chat thread becomes an invoice | Review (2026-01-02): reel sent | none yet |
| [acme-payment-links](acme-payment-links/README.md) | A payment link from one sentence | Recording (2026-01-05) | none yet |
| [acme-onboarding](acme-onboarding/README.md) | A new customer set up in two minutes | Delivered (2026-01-09) | \`acme-onboarding/final/acme-onboarding.mp4\` |
`;

// Two more demos at other stages, so the home screen (and its screenshot) shows more than one state.
function variant(dir, name, title, change) {
  const folder = join(dir, name);
  cpSync(join(dir, 'acme-invoice-bot'), folder, { recursive: true });
  for (const file of ['demo.json', 'handoff.json']) {
    const config = JSON.parse(readFileSync(join(folder, file), 'utf8'));
    writeFileSync(join(folder, file), `${JSON.stringify({ ...config, title }, null, 2)}\n`);
  }
  change(folder);
}

const { dir, cleanup } = exampleCopy();
let server;
let browser;
let passed = 0;
async function step(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

try {
  writeFileSync(join(dir, 'README.md'), INDEX);
  for (const file of ['AGENTS.md', 'check.py']) copyFileSync(join(REPO, 'starter', file), join(dir, file));
  variant(dir, 'acme-payment-links', 'Acme Payment Links', (folder) => {
    const takes = join(folder, 'recordings', 'takes.csv');
    writeFileSync(takes, readFileSync(takes, 'utf8').replace(/,keep,/, ',new,').replace(/,keep,/, ',new,'));
  });
  variant(dir, 'acme-onboarding', 'Acme Onboarding', (folder) => {
    mkdirSync(join(folder, 'final'));
    copyFileSync(join(folder, 'recordings', 'raw', '05-approve-t1.mp4'), join(folder, 'final', 'acme-onboarding.mp4'));
  });
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

  if (process.env.HOME_SHOT) {
    const out = join(REPO, 'docs', 'img');
    mkdirSync(out, { recursive: true });
    await page.evaluate(() => { document.querySelectorAll('.home-root').forEach((el) => { el.textContent = '~/demos'; }); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(out, 'studio-home-1440.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(out, 'studio-home-390.png') });
    await page.setViewportSize({ width: 1440, height: 900 });
  }

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
