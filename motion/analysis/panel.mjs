// 3D tilt of a projected rectangle (panel, device screen) from points on its edges.
// Usage: node panel.mjs '<json spec>'   spec = { "edges": { "top": [[x,y],...], "right": [...], "bottom": [...], "left": [...] },
//                                               "corners": { "tl": [x,y], ... } (optional), "p": [1200,2000,2667] (optional) }
// Coordinates are full-resolution 1920x1080 pixels. Model: a w x h rectangle centred at (tx, ty) in the z=0 plane,
// rotated M = Rx * Ry * Rz (rz = in-plane, degrees, + = clockwise on screen; ry + = right edge recedes;
// rx + = top edge recedes), projected CSS-style with perspective p and origin at frame centre: s = p / (p - z).
// Nelder-Mead minimises squared distances of edge points to the projected edge lines (+ corner distances).
// It also reports the vanishing distance of the side edges (perspective-free) when left and right edges are given.
const spec = JSON.parse(process.argv[2] ?? 'null');
if (!spec) { console.error("usage: node panel.mjs '{\"edges\":{...}}'"); process.exit(2); }
const CX = 960, CY = 540, D = Math.PI / 180;

function project(par, p) {
  const [rx, ry, rz, tx, ty, w, h] = par;
  const pts = { tl: [-w / 2, -h / 2], tr: [w / 2, -h / 2], br: [w / 2, h / 2], bl: [-w / 2, h / 2] };
  const out = {};
  for (const [k, [x0, y0]] of Object.entries(pts)) {
    let x = x0 * Math.cos(rz * D) - y0 * Math.sin(rz * D), y = x0 * Math.sin(rz * D) + y0 * Math.cos(rz * D), z = 0;
    [x, z] = [x * Math.cos(ry * D) + z * Math.sin(ry * D), -x * Math.sin(ry * D) + z * Math.cos(ry * D)];
    [y, z] = [y * Math.cos(rx * D) - z * Math.sin(rx * D), y * Math.sin(rx * D) + z * Math.cos(rx * D)];
    const s = p / (p - z);
    out[k] = [CX + (x + tx - 0) * s, CY + (y + ty) * s];
  }
  return out;
}
const edgeCorners = { top: ['tl', 'tr'], right: ['tr', 'br'], bottom: ['bl', 'br'], left: ['tl', 'bl'] };
function lineDist([x, y], [x1, y1], [x2, y2]) { const dx = x2 - x1, dy = y2 - y1; return Math.abs(dy * (x - x1) - dx * (y - y1)) / Math.hypot(dx, dy); }
function loss(par, p) {
  if (par[5] < 50 || par[6] < 50 || Math.abs(par[0]) > 75 || Math.abs(par[1]) > 75) return 1e12;
  const c = project(par, p); let s = 0;
  for (const [e, list] of Object.entries(spec.edges || {})) { const [a, b] = edgeCorners[e]; for (const q of list) s += lineDist(q, c[a], c[b]) ** 2; }
  for (const [k, q] of Object.entries(spec.corners || {})) s += (q[0] - c[k][0]) ** 2 + (q[1] - c[k][1]) ** 2;
  return s;
}
function nelderMead(f, x0, step, iters = 4000) {
  const n = x0.length; let S = [x0, ...x0.map((_, i) => x0.map((v, j) => v + (i === j ? step[j] : 0)))].map((x) => ({ x, v: f(x) }));
  for (let k = 0; k < iters; k++) {
    S.sort((a, b) => a.v - b.v);
    const c = S[0].x.map((_, j) => S.slice(0, n).reduce((s, q) => s + q.x[j], 0) / n);
    const w = S[n]; const r = c.map((v, j) => v + (v - w.x[j])); const fr = f(r);
    if (fr < S[0].v) { const e = c.map((v, j) => v + 2 * (v - w.x[j])); const fe = f(e); S[n] = fe < fr ? { x: e, v: fe } : { x: r, v: fr }; }
    else if (fr < S[n - 1].v) S[n] = { x: r, v: fr };
    else { const ct = c.map((v, j) => v + 0.5 * (w.x[j] - v)); const fc = f(ct);
      if (fc < w.v) S[n] = { x: ct, v: fc }; else S = S.map((q, i) => i === 0 ? q : (() => { const x = q.x.map((v, j) => S[0].x[j] + 0.5 * (v - S[0].x[j])); return { x, v: f(x) }; })()); }
  }
  S.sort((a, b) => a.v - b.v); return S[0];
}
const allPts = [...Object.values(spec.edges || {}).flat(), ...Object.values(spec.corners || {})];
const xs = allPts.map((q) => q[0]), ys = allPts.map((q) => q[1]);
const init = [0, 0, 0, (Math.min(...xs) + Math.max(...xs)) / 2 - CX, (Math.min(...ys) + Math.max(...ys)) / 2 - CY, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
const results = [];
for (const p of spec.p || [1200, 2000, 2667]) {
  let best = null;
  for (const [a, b, c] of [[0, 0, 0], [20, 0, 0], [-20, 0, 0], [0, 20, 0], [0, -20, 0], [20, 20, 0], [20, -20, 0], [-20, 20, 0], [-20, -20, 0], [10, 10, 5], [10, -10, -5]]) {
    const r = nelderMead((x) => loss(x, p), [a, b, c, ...init.slice(3)], [5, 5, 3, 40, 40, 80, 80]);
    if (!best || r.v < best.v) best = r;
  }
  const n = allPts.length;
  results.push({ perspectivePx: p, rotateXdeg: +best.x[0].toFixed(1), rotateYdeg: +best.x[1].toFixed(1), rotateZdeg: +best.x[2].toFixed(1),
    widthPx: Math.round(best.x[5]), heightPx: Math.round(best.x[6]), rmsPx: +Math.sqrt(best.v / n).toFixed(1), corners: project(best.x, p) });
}
const out = { results };
const L = spec.edges?.left, R = spec.edges?.right;
if (L?.length >= 2 && R?.length >= 2) { // intersection of the two side lines
  const line = (A) => { const [a, b] = [A[0], A[A.length - 1]]; return [a, b]; };
  const [[x1, y1], [x2, y2]] = line(L), [[x3, y3], [x4, y4]] = line(R);
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) > 1e-9) { const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const vx = x1 + t * (x2 - x1), vy = y1 + t * (y2 - y1);
    out.sideVanishingPoint = [Math.round(vx), Math.round(vy)];
    out.sideVanishingDistancePx = Math.round(Math.hypot(vx - CX, vy - CY)); // = p / tan(tilt) for a pure rotateX
  }
}
for (const r of results) for (const k of Object.keys(r.corners)) r.corners[k] = r.corners[k].map(Math.round);
console.log(JSON.stringify(out));
