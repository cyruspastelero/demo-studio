// Type metrics for one text line inside a rect of a full-resolution frame.
// Usage: node type.mjs <video> <t> <x:y:w:h> [--save=crop.png]
// bg = most common colour on the rect border; ink colour = median of the 10% of pixels furthest from bg;
// ink mask: distance to bg >= half the local (+-48 px) maximum distance, i.e. the half-contrast edge per word.
// Row profile gives top, baseline (last row with >= 30% of peak density), x-height top (first row with
// >= 55% of peak), bottom (descenders). Stem width = median horizontal ink run inside the x-height band.
// Column gaps split letters and words; each word reports its own core colour (to spot accent words).
import { grab, hex, dist, median, round, run } from './lib.mjs';

const [video, tArg, rectArg, ...rest] = process.argv.slice(2);
if (!rectArg) { console.error('usage: node type.mjs <video> <t> <x:y:w:h> [--save=crop.png]'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const [rx, ry, rw, rh] = rectArg.split(':').map(Number);
const f = await grab(video, Number(tArg));
const P = (x, y) => { const i = ((ry + y) * f.w + rx + x) * 3; return [f.buf[i], f.buf[i + 1], f.buf[i + 2]]; };

// Background: mode of border pixels (5-bit bins).
const bins = new Map();
const addBin = (p) => { const k = (p[0] >> 3) << 10 | (p[1] >> 3) << 5 | (p[2] >> 3); const e = bins.get(k) || { s: [0, 0, 0], c: 0 }; e.s = e.s.map((v, i) => v + p[i]); e.c++; bins.set(k, e); };
for (let x = 0; x < rw; x++) { addBin(P(x, 0)); addBin(P(x, rh - 1)); }
for (let y = 0; y < rh; y++) { addBin(P(0, y)); addBin(P(rw - 1, y)); }
const top = [...bins.values()].sort((a, b) => b.c - a.c)[0];
const bg = top.s.map((v) => v / top.c);

const all = [];
for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const p = P(x, y); all.push({ x, y, p, d: dist(p, bg) }); }
const far = [...all].sort((a, b) => b.d - a.d).slice(0, Math.max(20, Math.round(all.length * 0.01)));
// Ink = median of the farthest 1% (core of strokes), robust to antialiasing.
const ink = [0, 1, 2].map((c) => median(far.map((q) => q.p[c])));
const axis = ink.map((v, i) => v - bg[i]); const len2 = axis.reduce((s, v) => s + v * v, 0);
const cov = new Float32Array(rw * rh);
for (const q of all) cov[q.y * rw + q.x] = ((q.p[0] - bg[0]) * axis[0] + (q.p[1] - bg[1]) * axis[1] + (q.p[2] - bg[2]) * axis[2]) / len2;
// Adaptive mask so lighter accent words count too: ink where distance to bg >= half the largest
// distance found within +-48 px horizontally (and that local max is real contrast, > 40).
const D = new Float32Array(rw * rh); for (const q of all) D[q.y * rw + q.x] = q.d;
const colMax = Array.from({ length: rw }, (_, x) => { let m = 0; for (let y = 0; y < rh; y++) m = Math.max(m, D[y * rw + x]); return m; });
const localMax = colMax.map((_, x) => { let m = 0; for (let k = Math.max(0, x - 48); k <= Math.min(rw - 1, x + 48); k++) m = Math.max(m, colMax[k]); return m; });
const isInk = (x, y) => localMax[x] > 40 && D[y * rw + x] >= 0.5 * localMax[x];

const rows = Array.from({ length: rh }, (_, y) => { let c = 0; for (let x = 0; x < rw; x++) if (isInk(x, y)) c++; return c; });
const peak = Math.max(...rows);
const inkRows = rows.map((c, y) => [c, y]).filter(([c]) => c > 0).map(([, y]) => y);
const yTop = inkRows[0], yBottom = inkRows[inkRows.length - 1];
let baseline = yTop; rows.forEach((c, y) => { if (c >= 0.3 * peak) baseline = y; });
const xTop = rows.findIndex((c) => c >= 0.55 * peak);
const capH = baseline - yTop + 1, xH = baseline - xTop + 1, lineH = yBottom - yTop + 1;

const runs = [];
for (let y = xTop + Math.round(xH * 0.25); y <= baseline - Math.round(xH * 0.25); y++) {
  let r = 0; for (let x = 0; x < rw; x++) { if (isInk(x, y)) r++; else if (r) { runs.push(r); r = 0; } } if (r) runs.push(r);
}
const stem = median(runs.filter((r) => r <= xH * 0.6));

const cols = Array.from({ length: rw }, (_, x) => { for (let y = yTop; y <= yBottom; y++) if (isInk(x, y)) return 1; return 0; });
const segs = []; let s0 = -1;
cols.forEach((c, x) => { if (c && s0 < 0) s0 = x; if (!c && s0 >= 0) { segs.push([s0, x - 1]); s0 = -1; } }); if (s0 >= 0) segs.push([s0, rw - 1]);
const gaps = segs.slice(1).map((s, i) => s[0] - segs[i][1] - 1);
const wordGapMin = Math.max(capH * 0.22, 6);
const words = []; let cur = segs.length ? [...segs[0]] : null;
segs.slice(1).forEach((s, i) => { if (gaps[i] >= wordGapMin) { words.push(cur); cur = [...s]; } else cur[1] = s[1]; }); if (cur) words.push(cur);
const letterGaps = gaps.filter((g) => g < wordGapMin);
const wordInfo = words.map(([a, b]) => {
  const px = all.filter((q) => q.x >= a && q.x <= b && q.y >= yTop && q.y <= yBottom && D[q.y * rw + q.x] >= 0.85 * localMax[q.x]);
  return { x0: rx + a, x1: rx + b, widthPx: b - a + 1, core: px.length ? hex([0, 1, 2].map((c) => median(px.map((q) => q.p[c])))) : null };
});
const out = {
  t: Number(tArg), rect: rectArg, bg: hex(bg), ink: hex(ink),
  inkTopY: ry + yTop, baselineY: ry + baseline, bottomY: ry + yBottom,
  capOrAscenderPx: capH, xHeightPx: xH, lineInkPx: lineH,
  capPctOfFrame: round(100 * capH / f.h, 2), xHeightPctOfFrame: round(100 * xH / f.h, 2), lineInkPctOfFrame: round(100 * lineH / f.h, 2),
  stemPx: stem, stemToCap: round(stem / capH, 3),
  textBox: segs.length ? { x0: rx + segs[0][0], x1: rx + segs[segs.length - 1][1], centreX: rx + (segs[0][0] + segs[segs.length - 1][1]) / 2 } : null,
  medianLetterGapPx: median(letterGaps), letterGapToCap: round(median(letterGaps) / capH, 3),
  medianWordGapPx: median(gaps.filter((g) => g >= wordGapMin)), wordGapToCap: round(median(gaps.filter((g) => g >= wordGapMin)) / capH, 3),
  words: wordInfo,
};
console.log(JSON.stringify(out));
if (opt.save) await run('ffmpeg', ['-v', 'error', '-y', '-ss', tArg, '-i', video, '-frames:v', '1', '-vf', `crop=${rw}:${rh}:${rx}:${ry}`, opt.save]);
