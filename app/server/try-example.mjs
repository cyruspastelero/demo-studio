// "Try a copy" on the home screen: copies an example into the user's demos folder and gives it
// sample footage, so it can be opened and edited without touching the plugin's own example.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const SKIP = new Set(['node_modules', '.DS_Store']);

// <root>/<name>, or <name>-2, <name>-3 ... when that is taken.
export function freeName(root, name) {
  if (!existsSync(join(root, name))) return join(root, name);
  for (let n = 2; ; n += 1) if (!existsSync(join(root, `${name}-${n}`))) return join(root, `${name}-${n}`);
}

function sampleTakes(script, folder, slates) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, folder, ...(slates ? ['--slates'] : [])], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.stdout.resume();
    child.on('error', (error) => reject(new Error(`could not make sample footage: ${error.message}`)));
    child.on('close', (code) => (code === 0 ? resolvePromise()
      : reject(new Error(`could not make sample footage: ${err.trim().split('\n').slice(-3).join(' ') || `exit ${code}`}`))));
  });
}

export async function tryExample({ example, root, script }) {
  mkdirSync(root, { recursive: true });
  const target = freeName(root, basename(example));
  cpSync(example, target, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
  try {
    await sampleTakes(script, target, true);
  } catch (error) {
    // No Chrome to draw slates with: plain test patterns still make every shot playable.
    console.error(`studio: ${error.message}; using test patterns instead`);
    await sampleTakes(script, target, false);
  }
  return target;
}
