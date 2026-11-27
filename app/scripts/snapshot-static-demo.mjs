// Records the live demo for GitHub Pages. It starts the real studio on the repo's todo sample (with
// an empty demos root, so no private demo can leak in), drives the home page, the Templates tab and
// the editor in headless Chrome, and saves every read the app made under out-static/data/ by
// shared/static-key.mjs. The static build (vite --mode static) then replays them with no server.
//
//   npm run build -w app && npx vite build --mode static (in app/) && node app/scripts/snapshot-static-demo.mjs
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createStudio } from '../server/server.mjs';
import { staticKey } from '../shared/static-key.mjs';
import { BUNDLED, fontFile } from '../../scripts/fonts.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(APP, '..');
const OUT = join(APP, 'out-static');
const DATA = join(OUT, 'data');
const EXAMPLE = join(REPO, 'examples', 'todo-sample');

function fail(message) {
  console.error(`snapshot-static-demo: ${message}`);
  process.exit(1);
}

// Local paths in recorded JSON become neutral ones, so the published files name no one's machine.
function scrub(text, workspace) {
  return text.split(REPO).join('~/demo-studio').split(join(workspace, 'demos')).join('~/demos').split(workspace).join('~');
}

function save(key, body) {
  const file = join(DATA, key);
  if (!file.startsWith(DATA)) fail(`refusing to write outside data/: ${key}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}

async function record(page, workspace) {
  const pending = [];
  page.on('response', (res) => {
    const url = new URL(res.url());
    const method = res.request().method();
    if (!url.pathname.startsWith('/api/') || url.pathname === '/api/events' || !res.ok()) return;
    if (url.pathname.startsWith('/api/template-preview/')) return; // copied from look-templates
    const isOpen = method === 'POST' && url.pathname === '/api/open';
    if (method !== 'GET' && !isOpen) return;
    // The app asks with the scrubbed paths it was given (encodeURIComponent keeps "~"), so name
    // the file after that request, not the one made against this machine's real paths.
    const asked = (url.pathname + url.search)
      .split(encodeURIComponent(REPO)).join(encodeURIComponent('~/demo-studio'))
      .split(encodeURIComponent(join(workspace, 'demos'))).join(encodeURIComponent('~/demos'))
      .split(encodeURIComponent(workspace)).join(encodeURIComponent('~'));
    const key = staticKey(asked);
    pending.push(res.body().then((body) => {
      const text = key.endsWith('.json') ? Buffer.from(scrub(body.toString('utf8'), workspace)) : body;
      save(key, text);
    }).catch((error) => console.warn(`skipped ${key}: ${error.message}`)));
  });
  return () => Promise.all(pending);
}

async function main() {
  if (!readdirSync(OUT).includes('index.html')) fail('build the static app first: npx vite build --mode static (in app/)');
  rmSync(DATA, { recursive: true, force: true });
  const workspace = mkdtempSync(join(tmpdir(), 'demo-studio-static-'));
  mkdirSync(join(workspace, 'demos'));
  process.env.DEMO_ROOT = join(workspace, 'demos');

  const studio = createStudio({ repo: REPO, cwd: workspace, folder: null });
  const url = await studio.listen(4390);
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const settle = await record(page, workspace);
    await page.goto(url);
    await page.waitForTimeout(1500);
    if (process.env.SNAPSHOT_DEBUG) await page.screenshot({ path: process.env.SNAPSHOT_DEBUG });
    await page.getByText('Templates', { exact: true }).first().click();
    await page.waitForTimeout(1500);
    await page.getByText('Overview', { exact: true }).first().click();
    await page.waitForTimeout(1000);
    await page.getByTestId('demo-item').first().click();
    await page.waitForSelector('.timeline, [data-testid="timeline"]', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await settle();
  } finally {
    await browser.close();
    studio.close();
    rmSync(workspace, { recursive: true, force: true });
  }

  // Media and template previews are copied, not recorded: video is fetched in ranges.
  cpSync(EXAMPLE, join(DATA, 'media'), { recursive: true });
  // The bundled fonts, where fontUrl() in src/api.ts looks for them in the static build.
  mkdirSync(join(DATA, 'fonts'), { recursive: true });
  for (const font of BUNDLED) cpSync(fontFile(REPO, font.id), join(DATA, 'fonts', font.id));
  for (const id of readdirSync(join(REPO, 'look-templates'))) {
    cpSync(join(REPO, 'look-templates', id, 'preview'), join(DATA, 'api', 'template-preview', 'built-in', id), { recursive: true });
  }
  const keys = readdirSync(join(DATA, 'api'), { recursive: true });
  console.log(`snapshot-static-demo: recorded ${keys.length} files into ${DATA}`);
}

main().catch((error) => fail(error.stack ?? error.message));
