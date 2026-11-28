#!/usr/bin/env node
// Starts the local editor: node app/bin/demo-studio.mjs [demo-folder] [--port 4317] [--no-open] [--dev]
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStudio } from '../server/server.mjs';

const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
const REPO = resolve(APP_DIR, '..');
const DEFAULT_PORT = 4317;
const USAGE = 'usage: npm run studio [demo-folder] [-- --port 4317 --no-open]';

function parseArgs(argv) {
  const options = { folder: null, port: Number(process.env.STUDIO_PORT) || DEFAULT_PORT, open: true, dev: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port') options.port = Number(argv[(i += 1)]);
    else if (arg === '--no-open') options.open = false;
    else if (arg === '--dev') options.dev = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg.startsWith('--')) {
      console.error(`demo-studio: unknown option ${arg}\n${USAGE}`);
      process.exit(2);
    } else options.folder = arg;
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    console.error('demo-studio: --port needs a number between 1024 and 65535');
    process.exit(2);
  }
  return options;
}

function newestMtime(dir) {
  let newest = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    newest = Math.max(newest, stat.isDirectory() ? newestMtime(path) : stat.mtimeMs);
  }
  return newest;
}

// Builds the UI on first run and after the sources change, so `npm run studio` is the only step.
async function ensureUi() {
  const index = join(APP_DIR, 'out', 'index.html');
  const sources = Math.max(newestMtime(join(APP_DIR, 'src')), statSync(join(APP_DIR, 'index.html')).mtimeMs);
  if (existsSync(index) && statSync(index).mtimeMs >= sources) return;
  let vite;
  try {
    vite = await import('vite');
  } catch {
    console.error(`demo-studio: the editor's dependencies are missing. Run:\n  npm install --prefix "${REPO}"`);
    process.exit(1);
  }
  console.log('demo-studio: building the editor UI (first run or sources changed)...');
  await vite.build({ root: APP_DIR, logLevel: 'warn' });
}

// A checkout behind origin/main rejects demo.json files written with newer fields, so say so up front.
// Reads refs already fetched (no network); prints nothing outside a git checkout.
function warnIfBehind() {
  let behind = 0;
  try {
    behind = Number(execFileSync('git', ['-C', REPO, 'rev-list', '--count', 'HEAD..origin/main'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim());
  } catch {
    return;
  }
  if (behind > 0) {
    console.warn(`demo-studio: this copy is ${behind} commit${behind === 1 ? '' : 's'} behind origin/main, so `
      + `demo.json files made with a newer version may fail to load. Update: cd "${REPO}" && git checkout main && git pull`);
  }
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true })
    .on('error', () => console.log(`demo-studio: open ${url} in your browser`))
    .unref();
}

const options = parseArgs(process.argv.slice(2));
warnIfBehind();
// npm run changes the working folder to the repo; INIT_CWD is where the command was typed.
const cwd = process.env.INIT_CWD ?? process.cwd();
const folder = options.folder ? resolve(cwd, options.folder) : null;
if (!options.dev) await ensureUi();
let studio;
try {
  studio = createStudio({ repo: REPO, cwd, folder, dev: options.dev });
} catch (error) {
  console.error(`demo-studio: ${error.message}`);
  process.exit(1);
}
const base = await studio.listen(options.port);
// The bare address is the home screen; #edit opens the demo the server has open (the folder given).
const url = folder ? `${base}#edit` : base;
console.log(`demo-studio: editor running at ${url}${folder ? ` for ${folder}` : ''}`);
console.log('demo-studio: press Ctrl+C to stop');
if (options.open) openBrowser(url);

const stop = async () => {
  await studio.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
