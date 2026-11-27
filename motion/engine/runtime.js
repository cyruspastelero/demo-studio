// Motion runtime: builds every scene from a storyboard + style once, then renders any time t on
// demand (window.motion.seek). No wall clock, no requestAnimationFrame: frames are deterministic.
import { el, px, prog, lerp, clamp01, rgba, mix } from './kit.js';
import { SCENES } from './scenes/index.js';

const stage = document.getElementById('stage');

const state = { scenes: [], cues: [], warnings: [], pendingImages: new Set(), ctx: null, bgLight: null, bgDark: null };

function fontFace(name, url) {
  const face = new FontFace(name, `url("${url}")`, { weight: '100 900' });
  document.fonts.add(face);
  return face.load();
}

function buildBackground(ctx) {
  const layer = el('div', {}, stage, 'layer');
  const make = (pal) => {
    const node = el('div', {}, layer, 'layer');
    const kind = (pal === ctx.style.palette.dark && ctx.style.background?.darkKind) || ctx.style.background?.kind || 'flat';
    const glow = ctx.style.background?.glowAccent ? ctx.accent : pal.glow || pal.bg2;
    const big = Math.max(ctx.W, ctx.H);
    if (kind === 'radialBottom') node.style.background = `radial-gradient(${px(big * 0.9)} ${px(big * 0.55)} at 50% 108%, ${rgba(glow, 0.85)} 0%, ${rgba(glow, 0.25)} 38%, transparent 70%), ${pal.bg}`;
    else if (kind === 'radialCentre') node.style.background = `radial-gradient(${px(big * 0.8)} ${px(big * 0.6)} at 50% 45%, ${pal.bg} 0%, ${pal.bg2} 100%)`;
    else if (kind === 'linear') node.style.background = `linear-gradient(180deg, ${pal.bg} 0%, ${pal.bg2} 100%)`;
    else if (kind === 'sky') node.style.background = `radial-gradient(${px(big * 0.75)} ${px(big * 0.5)} at 50% 105%, ${rgba(glow, 0.9)} 0%, ${rgba(glow, 0.35)} 45%, transparent 75%), radial-gradient(${px(big * 0.5)} ${px(big * 0.35)} at 50% 50%, ${rgba(glow, 0.18)} 0%, transparent 70%), linear-gradient(180deg, ${pal.bg} 0%, ${pal.bg2} 100%)`;
    else node.style.background = `radial-gradient(${px(big * 0.9)} ${px(big * 0.7)} at 50% 40%, ${pal.bg} 0%, ${pal.bg2} 100%)`;
    return node;
  };
  state.bgLight = make(ctx.style.palette.light);
  state.bgDark = make(ctx.style.palette.dark);
}

/** Mix a little of the brand accent into the background, so one style suits any brand colour. */
function tintStyle(style, accent) {
  const tint = style.background?.tint || 0;
  if (!tint) return style;
  const tone = (pal) => ({ ...pal, bg: mix(pal.bg, accent, tint * 0.6), bg2: mix(pal.bg2, accent, tint), glow: mix(pal.glow || pal.bg2, accent, Math.min(1, tint * 3)) });
  return { ...style, palette: { ...style.palette, light: tone(style.palette.light), dark: tone(style.palette.dark) } };
}

function makeCtx(config) {
  const { board, size, assets, beat } = config;
  const style = tintStyle(config.style, board.brand.accent);
  const W = size.w, H = size.h;
  const u = Math.min(W, H) / 100;
  const brandFonts = board.brand.fonts || {};
  const fonts = {
    display: brandFonts.display ? { family: brandFonts.display.family, weight: brandFonts.display.weight ?? style.fonts.display.weight } : style.fonts.display,
    body: brandFonts.body ? { family: brandFonts.body.family, weight: brandFonts.body.weight ?? style.fonts.body.weight } : style.fonts.body,
  };
  const accent = board.brand.accent;
  const ctx = {
    W, H, u, portrait: H > W * 1.05, wide: W > H * 1.3, style, board, brand: board.brand, accent,
    accentInk: board.brand.accentInk || '#ffffff', beat, pxScale: Math.min(W, H) / 1080,
    pal: style.palette[style.tone],
    font: (which) => fonts[which] || fonts.display,
    minPx: () => style.type.minPx ?? 44,
    sec: (at) => at * beat,
    asset(spec) {
      const key = typeof spec === 'string' ? spec : JSON.stringify(spec);
      const a = assets[key];
      if (!a) throw new Error(`asset not prepared: ${key}`);
      if (a.kind === 'clip' && !a.frameUrl) a.frameUrl = (i) => `${a.dir}/${String(i + 1).padStart(5, '0')}.jpg`;
      return a;
    },
    accentText(span) {
      const mode = style.fonts.accent || 'color';
      span.style.color = accent;
      if (mode === 'italic') { span.dataset.skew = String(style.fonts.accentSkew ?? -11); span.style.fontWeight = String(style.fonts.display.accentWeight ?? 300); span.style.transform = `skewX(${span.dataset.skew}deg)`; }
      if (mode === 'gradient') {
        span.style.backgroundImage = `linear-gradient(90deg, ${accent}, ${mix(accent, '#ffffff', 0.35)})`;
        span.style.webkitBackgroundClip = 'text';
        span.style.color = 'transparent';
      }
    },
    shadow(scale = 1) {
      const tint = ctx.pal.shadowTint === 'accent' ? accent : (ctx.pal.shadowTint || '#000000');
      return style.panel.shadow.replaceAll('TINT', tint).replace(/(-?\d+(?:\.\d+)?)U/g, (_, n) => px(Number(n) * u * scale));
    },
    cue: (t, name, gain = 0) => state.currentScene && state.cues.push({ t: state.currentScene.start + t, name, gain, scene: state.currentScene.index }),
    warn: (msg) => state.warnings.push(`scenes[${state.currentScene?.index}]: ${msg}`),
    pending: (img) => state.pendingImages.add(img),
  };
  return ctx;
}

function applyTone(ctx, scene) {
  const tone = scene.tone && scene.tone !== 'auto' ? scene.tone : (ctx.style.sceneTones?.[scene.type] || ctx.style.tone);
  return { ...ctx, pal: ctx.style.palette[tone], tone };
}

async function load(config) {
  const { style, board, size, timeline } = config;
  stage.style.width = `${size.w}px`;
  stage.style.height = `${size.h}px`;
  document.body.style.width = `${size.w}px`;
  const loads = [];
  for (const f of [style.fonts.display, style.fonts.body]) loads.push(fontFace(f.family, `/fonts/${f.file}`));
  for (const f of Object.values(board.brand.fonts || {})) loads.push(fontFace(f.family, f.url));
  await Promise.all(loads);
  await document.fonts.ready;

  const ctx = makeCtx(config);
  state.ctx = ctx;
  buildBackground(ctx);
  const layer = el('div', {}, stage, 'layer');
  board.scenes.forEach((params, index) => {
    const def = SCENES[params.type];
    if (!def) throw new Error(`scenes[${index}]: unknown scene type ${params.type}`);
    const { start, end } = timeline[index];
    const root = el('div', {}, layer, 'scene');
    root.style.zIndex = String(10 + index);
    const cam = el('div', {}, root, 'cam');
    const scene = { index, start, end, dur: end - start, params, root, cam };
    state.currentScene = scene;
    const sctx = applyTone(ctx, params);
    scene.tone = sctx.tone;
    scene.exit = params.exit && params.exit !== 'auto' ? params.exit : style.motion.transition;
    scene.exitSec = scene.exit === 'cut' ? 0 : style.motion.exitMs / 1000;
    scene.impl = def.build(cam, { ...def.defaults, ...params }, sctx, scene.dur);
    if (params.sfx !== false && def.enterCue) ctx.cue(0, def.enterCue);
    if (params.sfx !== false) (params.cues || []).forEach((c) => ctx.cue(ctx.sec(c.at), c.name, c.gain || 0));
    state.scenes.push(scene);
  });
  state.currentScene = null;
  if (!state.cues.length || board.scenes.length) state.cues.sort((a, b) => a.t - b.t);
  await waitImages(stage.querySelectorAll('img'));
  return { warnings: state.warnings, cues: state.cues };
}

async function waitImages(list) {
  await Promise.all([...list].map((img) => (img.complete && img.naturalWidth ? img.decode().catch(() => {}) : new Promise((res, rej) => {
    img.onload = () => img.decode().then(res, res);
    img.onerror = () => rej(new Error(`image failed to load: ${img.src}`));
  }))));
}

function exitTransform(kind, p, ctx) {
  if (p <= 0) return { transform: '', filter: 'none', opacity: '1' };
  switch (kind) {
    case 'whip': return { transform: `translateX(${px(-p * ctx.W * 0.55)}) scaleX(${1 + p * 0.25})`, filter: `blur(${px(p * 26)})`, opacity: String(1 - p * p) };
    case 'zoomThrough': return { transform: `scale(${1 + p * 0.45})`, filter: `blur(${px(p * 20)})`, opacity: String(1 - p) };
    case 'fade': return { transform: '', filter: 'none', opacity: String(1 - p) };
    default: return { transform: `scale(${1 - p * (1 - (ctx.style.motion.exitScale ?? 0.88))})`, filter: `blur(${px(p * 16)})`, opacity: String(1 - p) };
  }
}

async function seek(t) {
  const ctx = state.ctx;
  const style = ctx.style;
  state.pendingImages.clear();
  let darkness = 0, weight = 0;
  for (const s of state.scenes) {
    const local = t - s.start;
    const visible = local >= 0 && local < s.dur + s.exitSec;
    s.root.style.display = visible ? 'block' : 'none';
    if (!visible) continue;
    const exitP = s.exitSec > 0 ? prog(local, s.dur, s.exitSec, style.motion.exitEase) : 0;
    const drift = Math.max(0.5, 1 + style.motion.drift * Math.min(local, s.dur + s.exitSec));
    const x = exitTransform(s.exit, exitP, ctx);
    s.cam.style.transform = `${x.transform} scale(${drift})`;
    s.cam.style.filter = x.filter;
    s.cam.style.opacity = x.opacity;
    s.impl.update(Math.min(local, s.dur + s.exitSec), s.dur);
    const w = 1 - exitP;
    darkness += (s.tone === 'dark' ? 1 : 0) * w;
    weight += w;
  }
  const dark = weight > 0 ? darkness / weight : (style.tone === 'dark' ? 1 : 0);
  state.bgDark.style.opacity = String(dark);
  state.bgLight.style.opacity = String(1 - dark);
  if (state.pendingImages.size) await waitImages(state.pendingImages);
  return true;
}

window.motion = { load, seek, cues: () => state.cues, warnings: () => state.warnings };
window.motionReady = true;
