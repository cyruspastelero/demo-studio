// Snap approximate transition times to the frame of peak change in a cuts.mjs track.
// Usage: node refine.mjs <frames.json> [--win=0.25] t1 t2 ...
// For each t, picks the frame in [t-win, t+win] with the largest frame-diff (ties: scene score).
import fs from 'node:fs';
import { round } from './lib.mjs';

const args = process.argv.slice(2);
const file = args.shift();
const winArg = args.find((a) => a.startsWith('--win='));
const win = winArg ? Number(winArg.slice(6)) : 0.25;
const ts = args.filter((a) => !a.startsWith('--')).map(Number);
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const out = ts.map((t) => {
  let best = null;
  for (const f of j.frames) if (Math.abs(f.t - t) <= win && (!best || f.diff + 50 * f.scene > best.diff + 50 * best.scene)) best = f;
  return { approx: t, t: best.t, diff: best.diff, scene: best.scene, edge: best.edge, luma: best.luma };
});
console.log(JSON.stringify(out.map((o) => [o.approx, o.t, o.diff, o.scene])));
// Time of each refined transition in seconds, comma separated, for piping into other scripts.
console.log(out.map((o) => round(o.t, 3)).join(','));
