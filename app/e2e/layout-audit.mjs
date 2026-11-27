// Layout audit: every home section and the editor, at desktop, laptop and phone widths, in light and
// dark. Saves a screenshot of each (to look at) and fails on breakage a person would see:
//   - the page scrolls sideways
//   - a box sticks out of a card or panel that clips it (cut off at the edge)
//   - text is cut off with no ellipsis
// Usage: node e2e/layout-audit.mjs [out-dir]   (default: a temp folder, printed at the end)
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homeFixture } from './home-fixture.mjs';
import { exampleCopy, launch, startServer } from './harness.mjs';

const WIDTHS = [[1440, 900], [1024, 768], [390, 844]];
const THEMES = ['light', 'dark'];
const out = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'layout-audit-'));

// Runs in the page. Only visible elements count; scroll containers are allowed to hold wide content.
function findBreakage() {
  const problems = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) problems.push(`page scrolls sideways: ${document.documentElement.scrollWidth}px > ${vw}px`);
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const name = (el) => `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ''}.${[...el.classList].slice(0, 2).join('.')}`;
  const clips = (s) => /(hidden|clip)/.test(s.overflowX) || /(hidden|clip)/.test(s.overflow);
  const scrolls = (s) => /(auto|scroll)/.test(s.overflowX) || /(auto|scroll)/.test(s.overflow);
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.closest('svg, video, canvas, .stage, .tl-scroll, .text-layer, .sr-only')) continue;
    const s = getComputedStyle(el);
    // Text cut off with no ellipsis.
    if (clips(s) && s.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && el.children.length === 0 && el.textContent.trim()) {
      problems.push(`text cut off: ${name(el)} "${el.textContent.trim().slice(0, 40)}"`);
    }
    // A box that sticks out past the right edge of its nearest clipping or bordered card.
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (scrolls(ps)) break;
      const card = clips(ps) || ps.boxShadow !== 'none' || ps.borderStyle !== 'none';
      if (!card) continue;
      const pr = p.getBoundingClientRect();
      if (r.right > pr.right + 2 && r.width < 4000) problems.push(`sticks out of ${name(p)} by ${Math.round(r.right - pr.right)}px: ${name(el)}`);
      break;
    }
  }
  return [...new Set(problems)].slice(0, 15);
}

async function sweep(page, label, open) {
  const found = [];
  for (const theme of THEMES) {
    for (const [w, h] of WIDTHS) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate((t) => { localStorage.setItem('demo-studio.theme', t); document.documentElement.dataset.theme = t; }, theme);
      await open();
      await page.waitForTimeout(400);
      const shot = join(out, `${label}-${theme}-${w}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      for (const problem of await page.evaluate(findBreakage)) found.push(`${label} ${theme} ${w}px: ${problem}`);
    }
  }
  return found;
}

const home = homeFixture();
const demo = exampleCopy();
let browser;
const servers = [];
try {
  const homeServer = await startServer(null, 4537, { DEMO_ROOT: home.dir });
  const editorServer = await startServer(demo.folder, 4538);
  servers.push(homeServer, editorServer);
  browser = await launch();
  const page = await browser.newPage();
  const problems = [];
  await page.goto(homeServer.url);
  await page.waitForSelector('[data-testid="demo-card"]');
  for (const section of ['overview', 'demos', 'examples', 'prompts', 'templates']) {
    problems.push(...await sweep(page, `home-${section}`, async () => {
      const nav = page.locator(`[data-testid="nav-${section}"]`).filter({ visible: true }).first();
      if (await nav.count()) await nav.click();
    }));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(editorServer.url);
  await page.waitForSelector('[data-testid="shot"]');
  problems.push(...await sweep(page, 'editor', async () => {
    const shot = page.locator('[data-testid="shot"]').nth(1);
    if (await shot.isVisible()) await shot.click();
  }));
  console.log(`screenshots: ${out}`);
  if (problems.length) console.log(problems.join('\n'));
  assert.deepEqual(problems, [], `${problems.length} layout problem(s)`);
  console.log('layout audit passed');
} catch (error) {
  console.error(`layout audit FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  servers.forEach((s) => s.stop());
  home.cleanup?.();
  demo.cleanup();
}
