// Renders the keynote cut's graphics with headless Chrome: background keyframes, the window card and
// mask, and every unique overlay frame, as PNGs. build-keynote.py writes the job file and calls this.
// Usage: node keynote-render.mjs <job.json>
// Safety: every output path must sit inside the job's work folder; fonts load only from the
// plugin's assets/fonts; images must be data: URIs; every network request is blocked.
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { PLUGIN_ROOT, launchChrome, loadPlaywright } from './pw.mjs';
import { blockRequests } from './card-safety.mjs';
import { html, render } from './keynote-page.mjs';

const FONT_FILE = /^[A-Za-z][A-Za-z0-9-]*\.woff2$/;
const IMAGE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const HEX = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

function fail(message) {
  console.error(`keynote-render: ${message}`);
  process.exit(1);
}

const jobPath = process.argv[2];
if (!jobPath || !existsSync(jobPath)) fail('usage: node keynote-render.mjs <job.json>');
const job = JSON.parse(readFileSync(jobPath, 'utf8'));
const outDir = realpathSync(job.out_dir);

function outPath(relative) {
  if (typeof relative !== 'string' || !relative || isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
    fail(`output path ${JSON.stringify(relative)} must be relative to the work folder`);
  }
  const full = resolve(outDir, relative);
  if (!full.startsWith(outDir + sep)) fail(`output path ${relative} leaves the work folder`);
  let leaf = null;
  try { leaf = lstatSync(full); } catch { /* new file */ }
  if (leaf?.isSymbolicLink()) fail(`${full} is a symlink; refusing to write through it`);
  return full;
}

function fontFace(family, file, weight) {
  if (!FONT_FILE.test(file)) fail(`font file name ${file} is not allowed`);
  const data = readFileSync(join(PLUGIN_ROOT, 'assets', 'fonts', file)).toString('base64');
  return `@font-face { font-family: '${family}'; src: url(data:font/woff2;base64,${data}) format('woff2');`
    + ` font-weight: ${weight}; font-style: normal; font-display: block; }\n`;
}

const font = job.font;
let faces = fontFace('DS Text', font.text, '100 900');
const display = Object.entries(font.display || {});
faces += display.length ? display.map(([w, file]) => fontFace('DS Display', file, w)).join('')
  : fontFace('DS Display', font.display_text || font.text, '100 900');

const colors = job.colors;
for (const [key, value] of Object.entries(colors)) {
  for (const v of [value].flat()) if (typeof v === 'string' && !HEX.test(v)) fail(`colour ${key} is not #hex`);
}
// Look geometry (pill, highlight box, title weight) goes into CSS: numbers only, finite and in range.
const LOOK_DEFAULT = { pill: { centerY: 962, height: 68, radius: 999, fontSize: 30 },
  box: { stroke: 3, radius: 12, fill: 0.07, halo: 0.1, haloWidth: 6 }, title: { weight: 500 } };
const look = {};
for (const [group, values] of Object.entries(LOOK_DEFAULT)) {
  look[group] = {};
  for (const [key, fallback] of Object.entries(values)) {
    const v = job.look?.[group]?.[key] ?? fallback;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 2000) fail(`look ${group}.${key} is not a number in range`);
    look[group][key] = v;
  }
}
for (const [id, uri] of Object.entries(job.images || {})) if (!IMAGE.test(uri)) fail(`image ${id} is not a data: image`);

const { chromium } = await loadPlaywright();
const browser = await launchChrome(chromium);
let painted = [];
try {
  // One fixed viewport, tall enough for the window card; every shot is a clip of it. Resizing the
  // viewport between shots sometimes captured a stale layout (a mask with square bottom corners).
  const context = await browser.newContext({ viewport: { width: 1920, height: 1140 }, deviceScaleFactor: 1 });
  await blockRequests(context);
  const page = await context.newPage();
  await page.setContent(html(colors, faces, look));
  await page.evaluate(async () => {
    await document.fonts.load("500 132px 'DS Display'");
    await document.fonts.load("400 42px 'DS Display'");
    await document.fonts.load("500 30px 'DS Text'");
    await document.fonts.ready;
  });
  await page.addScriptTag({ content: `window.__render = ${render.toString()};` });
  const draw = (state) => page.evaluate(([s, images, styles]) => window.__render(s, images, styles),
    [state, job.images || {}, job.styles]);

  const groups = [
    ['backgrounds', job.backgrounds || [], false, null],
    ['static', job.static || [], true, null],
    ['overlay', job.frames || [], true, null],
  ];
  for (const [stage, list, transparent] of groups) {
    for (const [i, entry] of list.entries()) {
      const [width, height] = entry.size || [1920, 1080];
      if (!(width > 0 && width <= 1920 && height > 0 && height <= 1140)) fail(`frame size ${width}x${height} is too big`);
      await draw(entry.state);
      await page.screenshot({ path: outPath(entry.path), omitBackground: transparent, type: 'png',
        clip: { x: 0, y: 0, width, height } });
      if ((i + 1) % 25 === 0 || i + 1 === list.length) console.log(`PROGRESS render-${stage} ${i + 1}/${list.length}`);
    }
  }

  // Which font Chrome actually painted (quality-bar typography check).
  if (job.font_probe) {
    await draw(job.font_probe);
    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    for (const selector of ['#title .w', '#pilltext .w']) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) continue;
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      painted = painted.concat(fonts.map((f) => f.familyName));
    }
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(`FONTS ${JSON.stringify([...new Set(painted)])}`);
