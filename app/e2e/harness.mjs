// Shared setup for the browser tests: a temp copy of the example with synthetic takes, the studio
// server on a free port, and headless Chrome through playwright-core (no browser download).
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP = fileURLToPath(new URL('..', import.meta.url));
export const REPO = join(APP, '..');
const require = createRequire(join(REPO, 'package.json'));
const SERVER_START_MS = 20000;

export function exampleCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'demo-studio-e2e-'));
  const folder = join(dir, 'acme-invoice-bot');
  cpSync(join(REPO, 'examples', 'acme-invoice-bot'), folder, { recursive: true });
  const made = spawnSync(process.execPath, [join(APP, 'scripts', 'example-media.mjs'), folder], { stdio: 'inherit' });
  if (made.status !== 0) throw new Error('could not make the synthetic takes');
  return { dir, folder, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// folder: the demo to open in the editor, or null to start on the home screen.
export function startServer(folder, port = 4517, env = {}) {
  return new Promise((resolve, reject) => {
    const args = [join(APP, 'bin', 'demo-studio.mjs'), ...(folder ? [folder] : []), '--no-open', '--port', String(port)];
    const child = spawn(process.execPath, args, {
      cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, INIT_CWD: REPO, ...env },
    });
    let log = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`server did not start:\n${log}`));
    }, SERVER_START_MS);
    const onData = (chunk) => {
      log += chunk;
      const match = /running at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(log);
      if (match) {
        clearTimeout(timer);
        resolve({ url: match[1], log: () => log, stop: () => child.kill('SIGTERM') });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}:\n${log}`));
    });
  });
}

export async function launch() {
  const { chromium } = require('playwright-core');
  const options = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' };
  return chromium.launch({ ...options, headless: true });
}
