// Shared building blocks for scenes: elements, text blocks, media, panels, cursor, confetti, stars.
// Every update is a pure function of time so any frame can be rendered on its own.
import { prog, lerp, clamp01, ease } from '../lib/easing.mjs';
import { fitText, parseAccent } from '../lib/fit.mjs';

export { prog, lerp, clamp01, ease };

export function el(tag, css = {}, parent = null, cls = '') {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  Object.assign(node.style, css);
  if (parent) parent.appendChild(node);
  return node;
}

export const px = (n) => `${Math.round(n * 100) / 100}px`;

/** Seeded PRNG so confetti and scatter layouts are identical on every render. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function mix(hexA, hexB, p) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const c = a.map((v, i) => Math.round(lerp(v, b[i], p)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ---------- text ----------

const canvas = document.createElement('canvas');
const c2d = canvas.getContext('2d');

export function measurer(font, weight, tracking) {
  return (text, size) => {
    c2d.font = `${weight} ${size}px "${font}"`;
    return c2d.measureText(text).width + tracking * size * Math.max(0, text.length - 1);
  };
}

/**
 * A fitted, centred text block. Words carry accent flags from *markup*. Returns
 * {node, words: [{node, accent}], size, height, reveal(t, start, opts)}.
 */
export function textBlock(ctx, parent, text, { size = 'title', maxWidth, maxHeight, maxLines = 3, align = 'center', font = 'display', color, groups = null } = {}) {
  const st = ctx.style;
  const f = ctx.font(font);
  const base = st.type[size] * ctx.u;
  const minSize = Math.max(st.type.minPx ?? 44, ctx.minPx(size)) * ctx.pxScale;
  const tracking = st.type.tracking ?? -0.01;
  const words = parseAccent(text);
  const measure = measurer(f.family, f.weight, tracking);
  const lineHeight = st.type.lineHeight ?? 1.12;
  const fitted = fitText(words.map((w) => w.text), measure, {
    baseSize: base, minSize: Math.min(minSize, base), maxWidth, maxHeight: maxHeight ?? Infinity, maxLines, lineHeight, groups,
  });
  if (fitted.overflow) ctx.warn(`text does not fit even at ${Math.round(fitted.size)}px: "${text}"`);
  const node = el('div', {
    position: 'absolute', left: '0', top: '0', width: px(maxWidth), textAlign: align,
    fontFamily: `"${f.family}"`, fontWeight: String(f.weight), fontSize: px(fitted.size),
    lineHeight: String(lineHeight), letterSpacing: `${tracking}em`, color: color || ctx.pal.ink,
  }, parent);
  const out = [];
  let k = 0;
  for (const line of fitted.lines) {
    const lineNode = el('div', {}, node, 'line');
    line.forEach((_, i) => {
      const w = words[k++];
      const span = el('span', {}, lineNode, 'word');
      span.textContent = w.text + (i < line.length - 1 ? ' ' : '');
      if (w.accent) ctx.accentText(span);
      out.push({ node: span, accent: w.accent, text: w.text });
    });
  }
  const height = fitted.lines.length * fitted.size * lineHeight;
  return {
    node, words: out, size: fitted.size, height, width: maxWidth,
    /** Reveal words from `start` (seconds, local time); `mode` overrides the style reveal. */
    reveal(t, start, mode, within) { revealWords(ctx, out, t, start, mode, fitted.size, within); },
    hide(t, start, dur) {
      const p = prog(t, start, dur, 'in');
      node.style.opacity = String(1 - p);
      node.style.filter = p > 0 ? `blur(${px(p * (st.text.blurPx ?? 10))})` : 'none';
    },
  };
}

export function revealWords(ctx, words, t, start, mode, size, within = Infinity) {
  const st = ctx.style.text;
  const reveal = !mode || mode === 'style' ? st.reveal : mode;
  const wordSec = st.wordMs / 1000;
  const stagger = st.staggerMs / 1000;
  if (reveal === 'type') {
    const total = words.reduce((s, w) => s + w.text.length, 0) || 1;
    const perChar = Math.min(st.charMs ? st.charMs / 1000 : Math.max(0.02, (stagger * words.length) / total), (within * 0.85) / total);
    let charsBefore = 0, allDone = true, prevEnd = -Infinity;
    words.forEach((w, i) => {
      const full = w.text + (i < words.length - 1 ? ' ' : '');
      const wordStart = Array.isArray(start) ? Math.max(start[i], prevEnd) : start + charsBefore * perChar;
      prevEnd = wordStart + full.length * perChar;
      const shown = Math.max(0, Math.min(full.length, Math.floor((t - wordStart) / perChar + 1e-6)));
      w.node.textContent = full.slice(0, shown) || '\u200b';
      w.node.style.opacity = shown > 0 ? '1' : '0';
      w.node.style.filter = 'none';
      if (shown < full.trimEnd().length) allDone = false;
      charsBefore += full.length;
    });
    if (st.caret) caret(ctx, words, t, allDone, size);
    return;
  }
  const startOf = (i) => (Array.isArray(start) ? start[i] : start + i * stagger);
  const progress = words.map((_, i) => prog(t, startOf(i), wordSec, st.ease));
  centreVisible(words, progress);
  words.forEach((w, i) => {
    const p = progress[i];
    w.node.style.transformOrigin = reveal === 'blur' ? 'left center' : 'center';
    const blur = (st.blurPx ?? 0) * (1 - p);
    const rise = (st.rise ?? 0) * ctx.u * (1 - p);
    const scale = lerp(st.scaleFrom ?? 1, 1, p);
    w.node.style.opacity = String(clamp01(p * 1.4));
    w.node.style.filter = blur > 0.05 && reveal !== 'rise' ? `blur(${px(blur)})` : 'none';
    const skew = w.node.dataset.skew ? ` skewX(${w.node.dataset.skew}deg)` : '';
    w.node.style.transform = `translateY(${px(reveal === 'blur' ? rise * 0.5 : rise)}) scale(${scale})${skew}`;
  });
}

/**
 * Keep the revealed part of each line centred, so a line grows from the middle as words arrive
 * (the line slides left while words append). Reads layout, so call while the scene is visible.
 */
function centreVisible(words, progress) {
  const lines = new Map();
  words.forEach((w, i) => {
    const line = w.node.parentNode;
    if (!lines.has(line)) lines.set(line, []);
    lines.get(line).push({ w, p: progress[i] });
  });
  for (const [line, list] of lines) {
    const first = list[0].w.node, last = list[list.length - 1].w.node;
    const left = first.offsetLeft, full = last.offsetLeft + last.offsetWidth;
    let right = left;
    for (const { w, p } of list) {
      if (p <= 0) break;
      right = lerp(right, w.node.offsetLeft + w.node.offsetWidth, p);
    }
    const shift = right > left ? (full - right) / 2 : 0;
    line.style.transform = `translateX(${px(shift)})`;
  }
}

function caret(ctx, words, t, typedAll, size) {
  const last = [...words].reverse().find((w) => w.node.style.opacity === '1') || words[0];
  if (!last) return;
  let c = last.node.querySelector('.caret');
  words.forEach((w) => { const k = w.node.querySelector('.caret'); if (k && w !== last) k.remove(); });
  if (!c) {
    c = el('span', { display: 'inline-block', width: px(Math.max(2, size * 0.06)), height: px(size * 0.9), marginLeft: px(size * 0.04), verticalAlign: '-0.1em', background: ctx.accent }, null, 'caret');
    last.node.appendChild(c);
  }
  c.style.opacity = !typedAll || Math.floor(t * 2.2) % 2 === 0 ? '1' : '0';
}

// ---------- media ----------

/** An <img> showing a still or a clip frame. update(localSec) picks the clip frame. */
export function media(ctx, parent, spec, css = {}) {
  const asset = ctx.asset(spec);
  const img = el('img', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', objectFit: 'cover', ...css }, parent);
  img.alt = '';
  img.src = asset.kind === 'clip' ? asset.frameUrl(0) : asset.url;
  return {
    node: img, asset, aspect: asset.width / asset.height,
    update(localSec) {
      if (asset.kind !== 'clip') return;
      const idx = Math.max(0, Math.min(asset.count - 1, Math.floor(localSec * (asset.rate ?? 1) * asset.fps + 1e-6)));
      const url = asset.frameUrl(idx);
      if (img.dataset.frame !== String(idx)) { img.dataset.frame = String(idx); img.src = url; ctx.pending(img); }
    },
  };
}

// ---------- panel ----------

/** A rounded panel with optional window chrome, sized w x h (px), centred at (cx, cy). */
export function panel(ctx, parent, { w, h, cx, cy, chrome = 'window', fill } = {}) {
  const st = ctx.style.panel;
  const persp = el('div', { position: 'absolute', left: px(cx - w / 2), top: px(cy - h / 2), width: px(w), height: px(h), perspective: px(st.perspective) }, parent);
  const card = el('div', {
    position: 'absolute', inset: '0', borderRadius: px(st.radius * w), overflow: 'hidden',
    background: fill || ctx.pal.panel, boxShadow: ctx.shadow(), border: st.border ? st.border.replace('LINE', ctx.pal.line).replace('ACCENT', rgba(ctx.accent, 0.55)) : 'none',
    transformStyle: 'preserve-3d', willChange: 'transform',
  }, persp);
  const barH = chrome === 'window' && st.chromeBar !== false ? Math.max(14, h * 0.045) : 0;
  if (barH) {
    const bar = el('div', { position: 'absolute', left: '0', top: '0', right: '0', height: px(barH), background: ctx.pal.panel, borderBottom: `1px solid ${ctx.pal.line}` }, card);
    [0, 1, 2].forEach((i) => el('div', { position: 'absolute', top: px(barH / 2 - barH * 0.14), left: px(barH * 0.5 + i * barH * 0.45), width: px(barH * 0.28), height: px(barH * 0.28), borderRadius: '50%', background: ctx.pal.line }, bar));
  }
  const body = el('div', { position: 'absolute', left: '0', right: '0', top: px(barH), bottom: '0', overflow: 'hidden' }, card);
  if (st.glow) el('div', { position: 'absolute', inset: '0', borderRadius: 'inherit', boxShadow: st.glow.replace('ACCENT', ctx.accent), pointerEvents: 'none' }, card);
  return {
    wrap: persp, card, body, w, h, barH,
    /** Entry flies in from a steeper tilt with blur; then a slow drift. p: 0..1 entry, d: 0..1 drift. */
    pose(p, d, tilt = st.tilt, extra = {}) {
      const [rx, ry, rz] = tilt;
      const k = 1 - p;
      const sx = rx + k * 18 + d * -2, sy = ry + k * -22 + d * 4, sz = rz + k * -4;
      const ty = k * h * 0.35 + (extra.ty || 0);
      const s = lerp(0.86, 1, p) * (extra.scale || 1);
      card.style.transform = `translate3d(${px(extra.tx || 0)}, ${px(ty)}, 0) rotateX(${sx}deg) rotateY(${sy}deg) rotateZ(${sz}deg) scale(${s})`;
      card.style.opacity = String(clamp01(p * 2));
      card.style.filter = k > 0.02 ? `blur(${px(k * 12)})` : 'none';
    },
  };
}

// ---------- cursor ----------

const HAND = '<svg viewBox="0 0 32 36" xmlns="http://www.w3.org/2000/svg"><path d="M11 3.5c0-1.6 1.2-2.8 2.7-2.8s2.7 1.2 2.7 2.8v10.2l.2-.1c.4-1.4 1.6-2.3 3-2.1 1.3.2 2.2 1.3 2.2 2.6v.6c.5-1 1.5-1.6 2.7-1.4 1.3.2 2.2 1.3 2.2 2.6v1c.5-.8 1.4-1.2 2.4-1 1.2.2 2 1.3 2 2.5v7.3c0 5.6-4.4 10.1-10 10.1h-2.6c-3.2 0-6.1-1.6-7.9-4.2L3.6 20.6c-.8-1.2-.5-2.8.7-3.6 1.1-.7 2.6-.5 3.4.5l3.3 4.1V3.5z" fill="#fff" stroke="#1d1d1f" stroke-width="1.7" stroke-linejoin="round"/><path d="M16.4 13.7v6.3M21.8 14.9v5.1M26.7 17v4" stroke="#1d1d1f" stroke-width="1.5" stroke-linecap="round"/></svg>';
const ARROW = '<svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg"><path d="M3 2v27l7-6.4 4.7 10.6 4.9-2.1-4.6-10.4H24z" fill="#1d1d1f" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>';

/**
 * Cursor following steps [{t, x, y, click}] (seconds, px in parent coords). Moves ease in-out over
 * up to 0.55 s before each step; clicks squash the cursor and send a ripple ring.
 */
export function cursor(ctx, parent, steps) {
  const size = ctx.u * 5.2;
  const isHand = ctx.style.cursor !== 'arrow';
  const node = el('div', { position: 'absolute', left: '0', top: '0', width: px(size), height: px(size * 1.15), zIndex: '50', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))' }, parent);
  node.innerHTML = isHand ? HAND : ARROW;
  node.firstChild.style.width = '100%';
  node.firstChild.style.height = '100%';
  const ring = el('div', { position: 'absolute', width: px(size * 1.6), height: px(size * 1.6), borderRadius: '50%', border: `${px(ctx.u * 0.35)} solid ${ctx.accent}`, opacity: '0', zIndex: '49' }, parent);
  const hot = isHand ? [size * 0.42, size * 0.03] : [size * 0.1, size * 0.06];
  steps.forEach((s) => { if (s.click) ctx.cue(s.t, 'click'); });
  return {
    node,
    update(t) {
      if (!steps.length) return;
      let x = steps[0].x, y = steps[0].y;
      for (let i = 1; i < steps.length; i++) {
        const a = steps[i - 1], b = steps[i];
        const move = Math.min(0.55, b.t - a.t);
        const p = prog(t, b.t - move, move, 'inOut');
        if (t >= b.t - move) { x = lerp(a.x, b.x, p); y = lerp(a.y, b.y, p); }
      }
      const appear = prog(t, steps[0].t - 0.35, 0.3, 'out');
      let squash = 1, ringP = -1;
      for (const s of steps) {
        if (!s.click) continue;
        const dt = t - s.t;
        if (dt > -0.08 && dt < 0.16) squash = Math.min(squash, 1 - 0.16 * Math.sin(Math.PI * clamp01((dt + 0.08) / 0.24)));
        if (dt >= 0 && dt < 0.5) ringP = dt / 0.5;
      }
      node.style.opacity = String(appear);
      node.style.transform = `translate(${px(x - hot[0])}, ${px(y - hot[1] + (1 - appear) * size * 0.6)}) scale(${squash})`;
      if (ringP >= 0) {
        const r = ease('out')(ringP);
        ring.style.opacity = String((1 - ringP) * 0.8);
        ring.style.transform = `translate(${px(x - size * 0.8)}, ${px(y - size * 0.8)}) scale(${0.3 + r * 0.9})`;
      } else ring.style.opacity = '0';
    },
  };
}

// ---------- confetti and stars ----------

export function confetti(ctx, parent, { cx, cy, count = 90, seed = 7, colors }) {
  const r = rng(seed);
  const pieces = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.7;
    const speed = (0.6 + r() * 0.9) * Math.max(ctx.W, ctx.H) * 1.05;
    const node = el('div', { position: 'absolute', left: '0', top: '0', width: px(ctx.u * (1.6 + r() * 3.6)), height: px(ctx.u * (1.0 + r() * 2.4)), borderRadius: r() > 0.6 ? '50%' : px(ctx.u * 0.15), background: colors[Math.floor(r() * colors.length)], opacity: '0' }, parent);
    return { node, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (r() - 0.5) * 1440, tilt: r() * 360, drag: 1.6 + r() * 0.8 };
  });
  return {
    update(t) {
      pieces.forEach((pc) => {
        if (t < 0) { pc.node.style.opacity = '0'; return; }
        const k = pc.drag;
        const decay = (1 - Math.exp(-k * t)) / k;
        const x = cx + pc.vx * decay;
        const y = cy + pc.vy * decay + 0.5 * ctx.H * 0.9 * t * t;
        pc.node.style.opacity = String(clamp01(1.6 - t * 0.9));
        pc.node.style.transform = `translate(${px(x)}, ${px(y)}) rotate(${pc.tilt + pc.spin * t}deg) rotateX(${pc.spin * t * 0.7}deg)`;
      });
    },
  };
}

let starCount = 0;
export const STAR_PATH = 'M50 0 C54 34 66 46 100 50 C66 54 54 66 50 100 C46 66 34 54 0 50 C34 46 46 34 50 0Z';

export function star(ctx, parent, size, gradient = true) {
  const id = `star${++starCount}`;
  const node = el('div', { position: 'absolute', left: '0', top: '0', width: px(size), height: px(size), filter: `drop-shadow(0 ${px(size * 0.05)} ${px(size * 0.12)} ${rgba(ctx.accent, 0.35)})` }, parent);
  const light = mix(ctx.accent, '#ffffff', 0.45);
  node.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${gradient ? light : ctx.accent}"/><stop offset="1" stop-color="${ctx.accent}"/></linearGradient></defs><path d="${STAR_PATH}" fill="url(#${id})"/></svg>`;
  return node;
}
