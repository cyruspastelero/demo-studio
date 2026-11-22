// Track one element frame by frame (native fps) and fit a cubic-bezier to one of its metrics.
// Usage: node track.mjs <video> <start> <end> <x:y:w:h> <bgHex> <minDist> [--metric=w] [--save=track.json] [--mode=far|near]
// Per frame inside the rect: "ink" = pixels whose RGB distance to bgHex is > minDist (--mode=near inverts it).
// Metrics: n (ink count), x0 x1 y0 y1 (2nd/98th percentile extents), cx cy (centroid), w h (extent sizes),
// sharp (mean |gradient| on ink pixels, a blur proxy), contrast (mean ink distance to bg, an opacity proxy).
// Fit: the metric is normalised 0..1 between its first and last value; motion starts at the last frame within
// 2% of the start value and ends at the first frame within 2% of the end value. Grid search (step 0.05,
// x in [0,1], y in [-0.3,1.5]) for the cubic-bezier with least squared error on the samples in between, then a
// 0.01 refinement around the best. Reports bezier, duration ms, rms error, overshoot.
import fs from 'node:fs';
import { probe, eachFrame, dist, round } from './lib.mjs';

const [video, s, e, rect, bgHex, minD, ...rest] = process.argv.slice(2);
if (!minD) { console.error('usage: node track.mjs <video> <start> <end> <x:y:w:h> <bgHex> <minDist> [--metric=w] [--save=f.json] [--mode=far|near]'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const [rx, ry, rw, rh] = rect.split(':').map(Number);
const bg = [1, 3, 5].map((i) => parseInt(bgHex.slice(i, i + 2), 16));
const info = probe(video);
const start = Number(s), dur = Number(e) - start;
const near = opt.mode === 'near';
const rows = [];
const frames = [];
await eachFrame(video, { w: rw, h: rh, start, dur, vfPre: `crop=${rw}:${rh}:${rx}:${ry}` }, (buf, i) => frames.push(buf));
const pct = (arr, q) => { if (!arr.length) return NaN; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
frames.forEach((buf, i) => {
  const xs = [], ys = []; let sx = 0, sy = 0, n = 0, g = 0, c = 0;
  const L = (x, y) => { const k = (y * rw + x) * 3; return 0.2126 * buf[k] + 0.7152 * buf[k + 1] + 0.0722 * buf[k + 2]; };
  for (let y = 1; y < rh - 1; y++) for (let x = 1; x < rw - 1; x++) {
    const k = (y * rw + x) * 3; const d = dist([buf[k], buf[k + 1], buf[k + 2]], bg);
    if ((d > Number(minD)) === near) continue;
    n++; sx += x; sy += y; xs.push(x); ys.push(y); c += d;
    g += Math.abs(L(x + 1, y) - L(x - 1, y)) + Math.abs(L(x, y + 1) - L(x, y - 1));
  }
  const x0 = pct(xs, 0.02), x1 = pct(xs, 0.98), y0 = pct(ys, 0.02), y1 = pct(ys, 0.98);
  rows.push({ t: round(start + i / info.fps, 3), n, x0: rx + x0, x1: rx + x1, y0: ry + y0, y1: ry + y1, w: x1 - x0, h: y1 - y0,
    cx: n ? round(rx + sx / n, 1) : NaN, cy: n ? round(ry + sy / n, 1) : NaN, sharp: n ? round(g / n, 2) : 0, contrast: n ? round(c / n, 1) : 0 });
});

function bez(t, a, b) { const u = 1 - t; return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t; }
function solveT(x, x1, x2) { let t = x; for (let i = 0; i < 8; i++) { const fx = bez(t, x1, x2) - x; const d = 3 * (1 - t) ** 2 * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2); if (Math.abs(d) < 1e-6) break; t = Math.min(1, Math.max(0, t - fx / d)); } return t; }
function fit(samples) {
  const err = (x1, y1, x2, y2) => samples.reduce((acc, [u, v]) => acc + (bez(solveT(u, x1, x2), y1, y2) - v) ** 2, 0);
  let best = { e: Infinity };
  const grid = (lo, hi, st) => { const a = []; for (let v = lo; v <= hi + 1e-9; v += st) a.push(round(v, 3)); return a; };
  for (const x1 of grid(0, 1, 0.05)) for (const x2 of grid(0, 1, 0.05)) for (const y1 of grid(-0.3, 1.5, 0.05)) for (const y2 of grid(-0.3, 1.5, 0.05)) {
    const v = err(x1, y1, x2, y2); if (v < best.e) best = { e: v, p: [x1, y1, x2, y2] }; }
  const [a, b, c, d] = best.p;
  for (const x1 of grid(Math.max(0, a - 0.05), Math.min(1, a + 0.05), 0.01)) for (const x2 of grid(Math.max(0, c - 0.05), Math.min(1, c + 0.05), 0.01))
    for (const y1 of grid(b - 0.05, b + 0.05, 0.01)) for (const y2 of grid(d - 0.05, d + 0.05, 0.01)) { const v = err(x1, y1, x2, y2); if (v < best.e) best = { e: v, p: [x1, y1, x2, y2] }; }
  return { bezier: best.p, rms: round(Math.sqrt(best.e / samples.length), 3) };
}
const out = { video, rect, fps: info.fps, rows };
if (opt.metric) {
  const m = opt.metric; const v = rows.map((r) => r[m]);
  const v0 = v[0], v1 = v[v.length - 1], span = v1 - v0;
  const norm = v.map((x) => (x - v0) / span);
  let i0 = 0; for (let i = 0; i < norm.length; i++) { if (Math.abs(norm[i]) <= 0.02) i0 = i; else break; }
  let i1 = norm.length - 1; for (let i = i0 + 1; i < norm.length; i++) if (Math.abs(norm[i] - 1) <= 0.02) { i1 = i; break; }
  const samples = []; for (let i = i0; i <= i1; i++) samples.push([(i - i0) / (i1 - i0), norm[i]]);
  const f = fit(samples);
  out.fit = { metric: m, from: v0, to: v1, startT: rows[i0].t, endT: rows[i1].t, durationMs: Math.round((i1 - i0) / info.fps * 1000), frames: i1 - i0,
    overshoot: round(Math.max(...norm.slice(i0, i1 + 1)) - 1, 3), ...f, cssCubicBezier: `cubic-bezier(${f.bezier.join(', ')})`, normalised: samples.map(([u, y]) => [round(u, 3), round(y, 3)]) };
}
if (opt.save) fs.writeFileSync(opt.save, JSON.stringify(out));
console.log(JSON.stringify({ rows: rows.map((r) => `${r.t}|n${r.n}|x${r.x0}-${r.x1}|y${r.y0}-${r.y1}|c${r.cx},${r.cy}|s${r.sharp}|k${r.contrast}`), fit: out.fit && { ...out.fit, normalised: undefined } }, null, 0));
