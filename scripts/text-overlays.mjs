// Draws on-screen text as transparent 1920x1080 PNGs, exactly as the editor's preview shows it:
// the same CSS (app/shared/text-style.mjs), the same font file (fonts.mjs) and the same placement
// (the box's centre at text_pos, pushed back inside the frame). quick-preview.py burns them in;
// build-handoff.py puts them in the handoff for the editor to lay over each clip.
// Usage: node text-overlays.mjs job.json
//   job.json: { "demo_dir": "...", "out_dir": "...", "items": [{ "name": "03", "text": "...",
//               "pos": [x, y] | null, "size": 44 | null, "font": "inter" | null }] }
// Prints OUTPUT <png> per item. Exits 3 when there is no browser to draw with (playwright-core or
// Chrome missing), so a build without Chrome can say the overlays were skipped instead of stopping. Safety: no page script, every request blocked, text escaped,
// fonts only from fonts.mjs, output names checked and kept inside out_dir.
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_POS, FRAME, TEXT_BOX_CSS, TEXT_SIZE, fontStack, keepInside } from '../app/shared/text-style.mjs';
import { blockRequests, escapeHtml } from './card-safety.mjs';
import { DEFAULT_FONT, FontError, fontFaceCss } from './fonts.mjs';
import { createRequire } from 'node:module';
import { PLUGIN_ROOT, loadPlaywright } from './pw.mjs';

function fail(message) {
  console.error(`text-overlays: ${message}`);
  process.exit(1);
}

const NAME = /^[A-Za-z0-9_-]{1,60}$/;
const finite = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

function checkItem(item, index) {
  const where = `items[${index}]`;
  if (!NAME.test(item?.name ?? '')) fail(`${where}.name must be letters, digits, _ or -`);
  if (typeof item.text !== 'string' || !item.text.trim()) fail(`${where}.text is empty`);
  if (item.pos != null && !(Array.isArray(item.pos) && item.pos.length === 2 && item.pos.every((v) => finite(v, 0, 1)))) {
    fail(`${where}.pos must be [x, y] between 0 and 1`);
  }
  if (item.size != null && !finite(item.size, TEXT_SIZE.min, TEXT_SIZE.max)) fail(`${where}.size must be ${TEXT_SIZE.min} to ${TEXT_SIZE.max}`);
  return { ...item, pos: item.pos ?? DEFAULT_POS.onscreen, size: item.size ?? TEXT_SIZE.default, font: item.font ?? DEFAULT_FONT };
}

const page = (faces, item, left, top) => `<!doctype html><html><head><meta charset="utf-8"><style>
${faces}${TEXT_BOX_CSS}
html, body { margin: 0; width: ${FRAME.W}px; height: ${FRAME.H}px; background: transparent; overflow: hidden; }
</style></head><body><div class="text-box onscreen" style="left: ${left}px; top: ${top}px; font-size: ${item.size}px; font-family: ${escapeHtml(fontStack(item.font))};">${escapeHtml(item.text.replace(/\s+/g, ' ').trim())}</div></body></html>`;

// The measured width must use the real font: load the face and check it is there before measuring.
// (Playwright's evaluate runs in its own world, so it works with page scripts off.)
async function fontsReady(tab, item) {
  const family = fontStack(item.font).split(',')[0];
  const loaded = await tab.evaluate(async (font) => {
    await document.fonts.load(font);
    await document.fonts.ready;
    return document.fonts.check(font);
  }, `${item.size}px ${family}`);
  if (!loaded) fail(`${item.name}: font ${item.font} did not load`);
}

const args = process.argv.slice(2);
if (args.length !== 1) fail('usage: node text-overlays.mjs job.json');
let job;
try {
  job = JSON.parse(readFileSync(args[0], 'utf8'));
} catch (error) {
  fail(`could not read ${args[0]}: ${error.message}`);
}
const items = (job.items ?? []).map(checkItem);
const faces = {};
for (const item of items) {
  try {
    faces[item.font] ??= fontFaceCss(job.demo_dir, item.font);
  } catch (error) {
    if (error instanceof FontError) fail(`${item.name}: ${error.message}`);
    throw error;
  }
}
mkdirSync(job.out_dir, { recursive: true });

const NO_BROWSER = 3;
try {
  createRequire(resolve(PLUGIN_ROOT, 'package.json')).resolve('playwright-core');
} catch {
  console.error(`text-overlays: playwright-core is not installed. Fix: npm install --prefix "${PLUGIN_ROOT}"`);
  process.exit(NO_BROWSER);
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }), headless: true })
  .catch((error) => {
    console.error(`text-overlays: could not start Chrome (${error.message.split('\n')[0]}). Install Google Chrome or set CHROME_PATH.`);
    process.exit(NO_BROWSER);
  });
try {
  const context = await browser.newContext({ viewport: { width: FRAME.W, height: FRAME.H }, deviceScaleFactor: 1, javaScriptEnabled: false });
  await blockRequests(context);
  const tab = await context.newPage();
  for (const item of items) {
    // Lay it out once to measure the box, then place its centre the way the editor does.
    await tab.setContent(page(faces[item.font], item, 0, 0));
    await fontsReady(tab, item);
    const box = await tab.locator('.text-box').boundingBox();
    if (!box) fail(`${item.name}: the text did not lay out`);
    const [cx, cy] = keepInside(item.pos, { w: box.width / FRAME.W, h: box.height / FRAME.H });
    await tab.setContent(page(faces[item.font], item, cx * FRAME.W - box.width / 2, cy * FRAME.H - box.height / 2));
    await fontsReady(tab, item);
    const file = join(job.out_dir, `${item.name}.png`);
    await tab.screenshot({ path: file, omitBackground: true });
    console.log(`OUTPUT ${file}`);
  }
} finally {
  await browser.close().catch(() => {});
}
