import { existsSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { insideAny } from './paths.mjs';

// A real keynote cut already gives check-cut 62 rows; the cap only stops a runaway checker.
export const MAX_ROWS = 300;
export const MAX_TEXT = 300;
// check-cut also prints WARN rows for plan warnings; the drawer shows them as "worth a look".
const STATUSES = new Set(['PASS', 'FAIL', 'LOOK', 'WARN']);

// Same names check-cut.py's find_plan accepts: <slug>-keynote-cut[-narrated].mp4 -> <slug>-keynote-cut.plan.json.
export function planSidecar(video) {
  const stem = basename(video, extname(video)).replace(/-narrated$/, '');
  return /-keynote-cut$/.test(stem) ? join(dirname(video), `${stem}.plan.json`) : null;
}

// Which checkers run on which finished video. Only mp4 files inside the demo folder; check-cut
// only for a keynote cut with its plan sidecar. The quick preview is not checked: it draws
// unrendered cards as plain slates and has no sound, so the gate would flag it every time.
export function checkTargets(kind, outputs, folder) {
  const seen = new Set();
  const targets = [];
  if (kind === 'quick') return targets;
  for (const output of outputs) {
    if (extname(output).toLowerCase() !== '.mp4') continue;
    const real = insideAny([folder], output);
    if (!real || seen.has(real)) continue;
    seen.add(real);
    const plan = planSidecar(real);
    targets.push({ path: real, tools: plan && existsSync(plan) ? ['video-gate', 'check-cut'] : ['video-gate'] });
  }
  return targets;
}

export function checkCommand(tool, { repo, video, json }) {
  const name = { 'video-gate': 'video-gate.py', 'check-cut': 'check-cut.py' }[tool];
  if (!name) throw new Error(`unknown checker ${tool}`);
  return ['python3', ['-I', join(repo, 'scripts', name), video, '--json', json]];
}

// The JSON comes from a subprocess reading a user's video: accept only the documented row shape.
export function normalizeRows(data) {
  if (!Array.isArray(data)) throw new Error('results are not a list');
  if (data.length > MAX_ROWS) throw new Error(`more than ${MAX_ROWS} rows`);
  return data.map((row, i) => {
    if (!row || typeof row !== 'object' || !STATUSES.has(row.status)
      || typeof row.item !== 'string' || typeof row.text !== 'string') {
      throw new Error(`row ${i + 1} is not {status, item, text}`);
    }
    return { status: row.status === 'WARN' ? 'LOOK' : row.status, item: row.item.slice(0, 24), text: row.text.slice(0, MAX_TEXT) };
  });
}

export const oneLine = (text) => String(text).replace(/\s+/g, ' ').trim().slice(0, 200);
