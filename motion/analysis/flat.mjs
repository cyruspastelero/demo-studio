// Corner radius, fill, border and shadow of a roughly axis-aligned element (card, button, pill, panel).
// Usage: node flat.mjs <video> <t> <x:y:w:h> <bgHex> <minDist> [--bgfar=hex]
// The rect must contain the element plus a margin wide enough for its shadow. Mask = RGB distance to bgHex > minDist.
// Radius: per corner, horizontal inset of the mask edge vs the straight edge for rows going into the corner,
//   least-squares fit of a circular arc inset(k) = r - sqrt(r^2 - (r-k)^2).
// Shadow: luminance-free RGB distance to the far background along the centre column below/above and the centre row
//   left/right of the element; reports peak, distance where it drops to 50% and 10% of peak, colour at peak.
//   y-offset ~ (reach10 below - reach10 above) / 2, blur ~ mean of the two reaches (box-shadow blur ~ visible reach).
import { grab, hex, dist, median, round } from './lib.mjs';

const [video, t, rect, bgHex, minD, ...rest] = process.argv.slice(2);
if (!minD) { console.error('usage: node flat.mjs <video> <t> <x:y:w:h> <bgHex> <minDist> [--bgfar=hex]'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const [rx, ry, rw, rh] = rect.split(':').map(Number);
const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const bg = toRgb(bgHex), bgFar = opt.bgfar ? toRgb(opt.bgfar) : bg;
const f = await grab(video, Number(t));
const P = (x, y) => { const i = (y * f.w + x) * 3; return [f.buf[i], f.buf[i + 1], f.buf[i + 2]]; };
const on = (x, y) => dist(P(x, y), bg) > Number(minD);

// Bounding box from rows/cols with enough mask pixels (ignores stray specks).
const rowCount = [], colCount = new Array(rw).fill(0);
for (let y = ry; y < ry + rh; y++) { let c = 0; for (let x = rx; x < rx + rw; x++) if (on(x, y)) { c++; colCount[x - rx]++; } rowCount.push(c); }
const rMax = Math.max(...rowCount), cMax = Math.max(...colCount);
const y0 = ry + rowCount.findIndex((c) => c > 0.5 * rMax), y1 = ry + rowCount.length - 1 - [...rowCount].reverse().findIndex((c) => c > 0.5 * rMax);
const x0 = rx + colCount.findIndex((c) => c > 0.5 * cMax), x1 = rx + colCount.length - 1 - [...colCount].reverse().findIndex((c) => c > 0.5 * cMax);
const W = x1 - x0 + 1, H = y1 - y0 + 1;

function leftmost(y, from, to) { for (let x = from; x <= to; x++) if (on(x, y)) return x; return to; }
function rightmost(y, from, to) { for (let x = to; x >= from; x--) if (on(x, y)) return x; return from; }
function fitR(raw) { // raw[k] = inset for k rows in from the extreme edge; fit only up to where the edge turns straight
  const end = raw.findIndex((v) => v <= 1); if (end < 0) return null;
  const inset = raw.slice(0, Math.min(raw.length, end + 4));
  let best = { r: 0, e: Infinity };
  for (let r = 1; r <= Math.min(W, H) / 2; r += 0.5) { let e = 0;
    for (let k = 0; k < inset.length; k++) { const m = k < r ? r - Math.sqrt(Math.max(0, r * r - (r - k) ** 2)) : 0; e += (inset[k] - m) ** 2; }
    if (e < best.e) best = { r, e }; }
  return best.r;
}
const span = Math.min(Math.round(Math.min(W, H) / 2), 120);
const corners = {
  tl: fitR(Array.from({ length: span }, (_, k) => leftmost(y0 + k, x0 - 5, x0 + span) - x0)),
  tr: fitR(Array.from({ length: span }, (_, k) => x1 - rightmost(y0 + k, x1 - span, x1 + 5))),
  bl: fitR(Array.from({ length: span }, (_, k) => leftmost(y1 - k, x0 - 5, x0 + span) - x0)),
  br: fitR(Array.from({ length: span }, (_, k) => x1 - rightmost(y1 - k, x1 - span, x1 + 5))),
};
const rMed = median(Object.values(corners).filter((v) => v != null));

const inner = []; for (let y = y0 + Math.round(H * 0.3); y < y1 - Math.round(H * 0.3); y += 2) for (let x = x0 + Math.round(W * 0.1); x < x1 - Math.round(W * 0.1); x += 2) inner.push(P(x, y));
const fill = [0, 1, 2].map((c) => median(inner.map((p) => p[c])));
const ringPx = []; const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
for (let k = 0; k < 3; k++) ringPx.push(P(cx, y0 + k), P(cx, y1 - k), P(x0 + k, cy), P(x1 - k, cy));
const border = ringPx.sort((a, b) => dist(b, fill) - dist(a, fill)).slice(0, 4);

function shadow(dx, dy, startX, startY, maxLen) {
  const prof = []; for (let s = 1; s <= maxLen; s++) { const x = startX + dx * s, y = startY + dy * s; if (x < 0 || y < 0 || x >= f.w || y >= f.h) break; prof.push({ s, d: dist(P(x, y), bgFar), p: P(x, y) }); }
  // skip the antialiased edge: start where the profile stops falling steeply (first 3 px ignored)
  const tail = prof.slice(3); if (!tail.length) return null;
  const pk = tail.reduce((a, b) => (b.d > a.d ? b : a));
  const after = tail.filter((q) => q.s >= pk.s);
  const s50 = (after.find((q) => q.d <= pk.d * 0.5) || after[after.length - 1]).s;
  const s10 = (after.find((q) => q.d <= pk.d * 0.1) || after[after.length - 1]).s;
  return { peakDist: round(pk.d, 1), peakAt: pk.s, peakHex: hex(pk.p), reach50: s50, reach10: s10 };
}
const below = shadow(0, 1, cx, y1, 260), above = shadow(0, -1, cx, y0, 260), left = shadow(-1, 0, x0, cy, 260), right = shadow(1, 0, x1, cy, 260);
const out = { t: Number(t), box: { x0, y0, x1, y1, W, H }, radiusPx: corners, radiusMedianPx: rMed, radiusPctOfWidth: round(100 * rMed / W, 2), radiusPctOfHeight: round(100 * rMed / H, 2),
  fill: hex(fill), borderCandidates: border.map(hex), shadow: { below, above, left, right },
  yOffsetPx: below && above ? (below.reach10 - above.reach10) / 2 : null, blurPx: below && above ? (below.reach10 + above.reach10) / 2 : null };
console.log(JSON.stringify(out));
