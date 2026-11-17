// Shared by rec.mjs, run.mjs and title-cards.mjs: finds playwright-core and reads demo.json.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Resolves only from the plugin folder (after `npm install` there). Never from the current folder:
// a demo folder from someone else could ship its own node_modules/playwright-core.
export async function loadPlaywright() {
  let entry;
  try {
    entry = createRequire(resolve(PLUGIN_ROOT, 'package.json')).resolve('playwright-core');
  } catch {
    console.error(`playwright-core is not installed in the plugin folder. Fix:\n  npm install --prefix "${PLUGIN_ROOT}"`);
    process.exit(1);
  }
  const mod = await import(pathToFileURL(entry).href);
  return mod.chromium ? mod : mod.default; // the require entry is CommonJS
}

// Headless Chrome for rendering stills. CHROME_PATH overrides the installed Chrome.
export async function launchChrome(chromium) {
  const options = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' };
  try {
    return await chromium.launch({ ...options, headless: true });
  } catch (error) {
    console.error(`Could not start Chrome (${error.message.split('\n')[0]}). Install Google Chrome or set CHROME_PATH.`);
    process.exit(1);
  }
}

// demo.json next to recordings/ (or DEMO_CONFIG). Returns {} when there is none.
export function loadDemoConfig() {
  const candidates = [process.env.DEMO_CONFIG, '../demo.json', 'demo.json'].filter(Boolean);
  const file = candidates.find((f) => existsSync(f));
  if (!file) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`${file} is not valid JSON: ${error.message}`);
    process.exit(1);
  }
}

// demo.json may be someone else's: a window's port and match go into a CDP URL and a tab pick,
// and browser.timezone/locale into the recording context. Returns a list of problems.
const PORT_MIN = 1024;
const PORT_MAX = 65535;
const MATCH = /^[^\s\u0000-\u001f]{1,200}$/;
const LOCALE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/;
const TIMEZONE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;

const isPort = (value) => Number.isInteger(value) && value >= PORT_MIN && value <= PORT_MAX;

export function windowProblems(name, win) {
  if (!win || typeof win !== 'object' || Array.isArray(win)) return [`windows.${name} must be an object`];
  const problems = [];
  if (!isPort(win.port)) problems.push(`windows.${name}.port must be a whole number from ${PORT_MIN} to ${PORT_MAX}`);
  if (win.rx_port !== undefined && !isPort(win.rx_port)) problems.push(`windows.${name}.rx_port must be a whole number from ${PORT_MIN} to ${PORT_MAX}`);
  if (win.match !== undefined && (typeof win.match !== 'string' || !MATCH.test(win.match))) {
    problems.push(`windows.${name}.match must be a short piece of a URL (no spaces or control characters)`);
  }
  return problems;
}

export function browserProblems(browser) {
  if (browser === undefined) return [];
  if (!browser || typeof browser !== 'object' || Array.isArray(browser)) return ['browser must be an object'];
  const problems = [];
  if (browser.timezone !== undefined && (typeof browser.timezone !== 'string' || !TIMEZONE.test(browser.timezone))) {
    problems.push('browser.timezone must be an IANA zone such as Europe/London');
  }
  if (browser.locale !== undefined && (typeof browser.locale !== 'string' || !LOCALE.test(browser.locale))) {
    problems.push('browser.locale must be a locale such as en-US');
  }
  return problems;
}

function failWith(problems) {
  console.error(`demo.json: ${problems.join('; ')}`);
  process.exit(1);
}

export function browserConfig() {
  const browser = loadDemoConfig().browser;
  const problems = browserProblems(browser);
  if (problems.length) failWith(problems);
  return browser || {};
}

export function windowConfig(name) {
  const windows = loadDemoConfig().windows || {};
  const win = Object.hasOwn(windows, name) ? windows[name] : undefined;
  if (!win) {
    const known = Object.keys(windows).join(', ') || 'none';
    console.error(`unknown window "${name}". Windows in demo.json: ${known}. Add {"windows": {"${name}": {"port": 9333}}}.`);
    process.exit(1);
  }
  const problems = windowProblems(name, win);
  if (problems.length) failWith(problems);
  return win;
}
