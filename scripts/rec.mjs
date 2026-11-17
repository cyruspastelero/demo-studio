// Records a scene in one of the demo's Chrome windows (multi-window demos, for example two people
// in a chat). Clones that window's session into a 1440x810 DPR 2 context, then runs
// _project.js + lib.js + any part files + the scene body, exactly like an MCP run_code scene.
// Windows come from demo.json: {"windows": {"admin": {"port": 9334, "match": "slack.com", "rx_port": 8765}}}.
// Start each window with open-window.sh. Timezone/locale: demo.json "browser" or DEMO_TIMEZONE/DEMO_LOCALE.
// Usage (from recordings/): node rec.mjs <window> [scenes/<part>.js ...] scenes/<body>.js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, loadDemoConfig, loadPlaywright, windowConfig } from './pw.mjs';
import { rxTokensLine } from './rx-tokens.mjs';

const [who, ...files] = process.argv.slice(2);
if (!who || files.length === 0) {
  console.error('usage: node rec.mjs <window> [scenes/<part>.js ...] scenes/<body>.js');
  process.exit(1);
}
const win = windowConfig(who);
const browserOpts = loadDemoConfig().browser || {};
const timezoneId = process.env.DEMO_TIMEZONE || browserOpts.timezone;
const locale = process.env.DEMO_LOCALE || browserOpts.locale;
const lib = readFileSync(join(PLUGIN_ROOT, 'scripts', 'lib.js'), 'utf8');
// A per-window receiver port lets two windows record at once.
const rxPort = process.env.RX_PORT || win.rx_port;
const port = rxPort ? `PROJECT.port = ${Number(rxPort)};` : '';
// Read now, from recordings/.rx-token, so start the window's frame receiver before this.
const code = [readFileSync('scenes/_project.js', 'utf8'), port, rxTokensLine(), lib, ...files.slice(0, -1).map((f) => readFileSync(f, 'utf8')),
  'let stop = null;', 'try {', readFileSync(files.at(-1), 'utf8'), '} finally { if (stop) await stop(); }'].join('\n');

const { chromium } = await loadPlaywright();
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${win.port}`);
const base = browser.contexts()[0];
const page = base.pages().find((p) => win.match && p.url().includes(win.match)) ?? base.pages()[0];
const rec = await browser.newContext({
  storageState: await base.storageState(), viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2,
  ...(timezoneId ? { timezoneId } : {}), ...(locale ? { locale } : {}),
});
try {
  const run = new (Object.getPrototypeOf(async () => {}).constructor)('page', code);
  console.log(JSON.stringify(await run(page)));
} finally {
  await rec.close().catch(() => {});
  await browser.close().catch(() => {});
}
