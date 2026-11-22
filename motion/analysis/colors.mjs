// Colour sampling on full-resolution frames.
// Usage: node colors.mjs <video> <t1,t2,...> [--at=x:y,x:y,...] [--rect=x:y:w:h]
// Per time: corners and centre (21x21 median patches, 48 px in from the edges), a vertical profile
// down the centre column and the left edge (every 10% of height), a horizontal profile across the
// middle row, the luminance-extreme points, and the dominant colours of the frame (or --rect).
// --at samples extra points (median 7x7) for text, panel, border and glow colours.
import { grab, patch, hex, luma, dominant, round } from './lib.mjs';

const [video, times, ...rest] = process.argv.slice(2);
if (!times) { console.error('usage: node colors.mjs <video> <t1,t2,...> [--at=x:y,...] [--rect=x:y:w:h]'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const pts = opt.at ? opt.at.split(',').map((p) => p.split(':').map(Number)) : [];
const rect = opt.rect ? (([x, y, w, h]) => ({ x, y, w, h }))(opt.rect.split(':').map(Number)) : undefined;

for (const t of times.split(',').map(Number)) {
  const f = await grab(video, t);
  const m = 48, W = f.w, H = f.h;
  const s = (x, y, r = 10) => hex(patch(f, x, y, r));
  const out = {
    t,
    corners: { tl: s(m, m), tr: s(W - m, m), bl: s(m, H - m), br: s(W - m, H - m) },
    centre: s(W >> 1, H >> 1),
    edgeMid: { top: s(W >> 1, m), bottom: s(W >> 1, H - m), left: s(m, H >> 1), right: s(W - m, H >> 1) },
    vCentre: Array.from({ length: 11 }, (_, i) => s(W >> 1, Math.min(H - 11, Math.max(10, Math.round(i * H / 10))), 6)),
    vLeft: Array.from({ length: 11 }, (_, i) => s(m, Math.min(H - 11, Math.max(10, Math.round(i * H / 10))), 6)),
    hMid: Array.from({ length: 11 }, (_, i) => s(Math.min(W - 11, Math.max(10, Math.round(i * W / 10))), H >> 1, 6)),
    dominant: dominant(f, rect, 8, 3),
    points: pts.map(([x, y]) => ({ x, y, hex: s(x, y, 3) })),
  };
  let lo = { l: 1e9 }, hi = { l: -1 };
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
    const i = (y * W + x) * 3; const p = [f.buf[i], f.buf[i + 1], f.buf[i + 2]]; const l = luma(p);
    if (l < lo.l) lo = { l, x, y, hex: hex(p) }; if (l > hi.l) hi = { l, x, y, hex: hex(p) };
  }
  out.darkest = { ...lo, l: round(lo.l, 1) }; out.brightest = { ...hi, l: round(hi.l, 1) };
  console.log(JSON.stringify(out));
}
