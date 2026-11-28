// The storyboard's contact sheet: screenshots the sheet page storyboard.py wrote (every picture inline
// as a data: URI) into one tall PNG. Usage: node storyboard-sheet.mjs <sheet.html> <out.png>
// Safety: the page loads nothing but its own data: images (every request is blocked), and the PNG
// is written only as storyboard/storyboard.png next to the work folder that holds the page.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { launchChrome, loadPlaywright } from './pw.mjs';
import { blockRequests } from './card-safety.mjs';

function fail(message) {
  console.error(`storyboard-sheet: ${message}`);
  process.exit(1);
}

const [page, out] = process.argv.slice(2);
if (!page || !out || !existsSync(page)) fail('usage: node storyboard-sheet.mjs <sheet.html> <out.png>');
const storyboard = dirname(dirname(realpathSync(page)));  // <demo>/storyboard/.work/sheet.html
const target = resolve(out);
if (basename(storyboard) !== 'storyboard' || dirname(target) !== storyboard || basename(target) !== 'storyboard.png') {
  fail(`${out} must be storyboard.png in ${storyboard}`);
}

const { chromium } = await loadPlaywright();
const browser = await launchChrome(chromium);
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await blockRequests(context);
  const tab = await context.newPage();
  await tab.setContent(readFileSync(page, 'utf8'), { waitUntil: 'load' });
  await tab.screenshot({ path: target, fullPage: true, type: 'png' });
} finally {
  await browser.close().catch(() => {});
}
console.log(`OUTPUT ${target}`);
