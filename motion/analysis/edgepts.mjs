// Edge sample points of a panel that contrasts with its surroundings, for panel.mjs.
// Usage: node edgepts.mjs <video> <t> <x:y:w:h> <bgHex> <minDist> [step=40]
// Within the rect, a pixel is "panel" when its RGB distance to bgHex exceeds minDist.
// Rows (every step px): first/last panel x -> left/right edge points.
// Columns (every step px): first/last panel y -> top/bottom edge points.
// Prints JSON { left, right, top, bottom } (full-resolution pixels); trim the lists to the straight parts.
import { grab, dist } from './lib.mjs';

const [video, t, rect, bgHex, minD, stepArg = '40'] = process.argv.slice(2);
if (!minD) { console.error('usage: node edgepts.mjs <video> <t> <x:y:w:h> <bgHex> <minDist> [step]'); process.exit(2); }
const [rx, ry, rw, rh] = rect.split(':').map(Number); const step = Number(stepArg);
const bg = [1, 3, 5].map((i) => parseInt(bgHex.slice(i, i + 2), 16));
const f = await grab(video, Number(t));
const on = (x, y) => { const i = (y * f.w + x) * 3; return dist([f.buf[i], f.buf[i + 1], f.buf[i + 2]], bg) > Number(minD); };
const out = { left: [], right: [], top: [], bottom: [] };
for (let y = ry; y < ry + rh; y += step) {
  let a = -1, b = -1; for (let x = rx; x < rx + rw; x++) if (on(x, y)) { if (a < 0) a = x; b = x; }
  if (a >= 0) { out.left.push([a, y]); out.right.push([b, y]); }
}
for (let x = rx; x < rx + rw; x += step) {
  let a = -1, b = -1; for (let y = ry; y < ry + rh; y++) if (on(x, y)) { if (a < 0) a = y; b = y; }
  if (a >= 0) { out.top.push([x, a]); out.bottom.push([x, b]); }
}
console.log(JSON.stringify(out));
