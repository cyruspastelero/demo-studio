// Candidate soft-transition events from a cuts.mjs track (motion graphics rarely hard-cut).
// Usage: node events.mjs <frames.json> [sceneMin=0.08] [gapSec=0.5]
// Flags local peaks of the ffmpeg scene score, peaks of frame-diff, and dips of edge energy (blur),
// merges events closer than gapSec, prints one line per event.
import fs from 'node:fs';
import { round, median } from './lib.mjs';

const [file, sMin = '0.08', gap = '0.5'] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const F = j.frames; const n = F.length; const fps = j.fps;
const win = (i, r, k) => F.slice(Math.max(0, i - r), Math.min(n, i + r + 1)).map((f) => f[k]);
const ev = [];
for (let i = 1; i < n - 1; i++) {
  const f = F[i];
  const sceneMax = f.scene >= Math.max(...win(i, 3, 'scene'));
  const diffMed = median(win(i, 30, 'diff')) || 0.01;
  const edgeMed = median(win(i, 30, 'edge')) || 0.01;
  const reasons = [];
  if (sceneMax && f.scene >= Number(sMin)) reasons.push(`scene=${f.scene}`);
  if (f.diff >= Math.max(...win(i, 3, 'diff')) && f.diff > 4 * diffMed && f.diff > 3) reasons.push(`diff=${f.diff}(x${round(f.diff / diffMed, 1)})`);
  if (f.edge <= Math.min(...win(i, 6, 'edge')) && f.edge < 0.55 * edgeMed) reasons.push(`blurDip edge=${f.edge}/${round(edgeMed, 1)}`);
  if (Math.abs(f.luma - F[Math.max(0, i - 6)].luma) > 60) reasons.push(`lumaJump ${F[Math.max(0, i - 6)].luma}->${f.luma}`);
  if (reasons.length) ev.push({ i, t: round(i / fps, 3), reasons });
}
const merged = [];
for (const e of ev) {
  const last = merged[merged.length - 1];
  if (last && e.t - last.tEnd < Number(gap)) { last.tEnd = e.t; last.reasons.push(...e.reasons); }
  else merged.push({ t: e.t, tEnd: e.t, reasons: [...e.reasons] });
}
for (const m of merged) console.log(`${m.t.toFixed(2)}-${m.tEnd.toFixed(2)}  ${[...new Set(m.reasons)].slice(0, 5).join(' | ')}`);
