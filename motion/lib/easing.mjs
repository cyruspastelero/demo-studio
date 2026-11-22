// Cubic-bezier easing (same maths as CSS) plus small tween helpers. Runs in Node and the browser.

export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  function solveX(x) {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 30; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (x > v) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  }
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solveX(x)));
}

export const NAMED = {
  linear: [0, 0, 1, 1],
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  in: [0.55, 0, 1, 0.45],
  back: [0.34, 1.56, 0.64, 1],
  snap: [0.16, 1, 0.3, 1],
};

const cache = new Map();
/** Accepts a name from NAMED or a [x1,y1,x2,y2] array. */
export function ease(spec = 'out') {
  const key = Array.isArray(spec) ? spec.join(',') : spec;
  if (!cache.has(key)) {
    const points = Array.isArray(spec) ? spec : NAMED[spec];
    if (!points) throw new Error(`unknown easing "${spec}"`);
    cache.set(key, cubicBezier(...points));
  }
  return cache.get(key);
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, p) => a + (b - a) * p;

/** Eased progress of local time t through [start, start+dur]. */
export function prog(t, start, dur, spec = 'out') {
  if (dur <= 0) return t >= start ? 1 : 0;
  return ease(spec)(clamp01((t - start) / dur));
}
