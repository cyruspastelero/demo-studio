// UI-led scenes: tiltedPanel, uiFocus, promptType, buttonPress, aspectMorph, deviceFrame.
import { el, px, prog, lerp, clamp01, textBlock, media, panel, cursor, rgba, mix, ease, measurer } from '../kit.js';

/** Largest w x h with the given aspect inside maxW x maxH. */
export function fitBox(aspect, maxW, maxH) {
  return aspect > maxW / maxH ? { w: maxW, h: maxW / aspect } : { w: maxH * aspect, h: maxH };
}

function headlineBlock(ctx, root, text, { y, size = 'title' }) {
  if (!text) return null;
  const b = textBlock(ctx, root, text, { size, maxWidth: ctx.W * (ctx.portrait ? 0.86 : 0.7), maxLines: 2 });
  b.node.style.left = px(ctx.W / 2 - b.width / 2);
  b.node.style.top = px(y - b.height / 2);
  b.node.style.zIndex = '30';
  return b;
}

function panelLayout(ctx, aspect, withHeadline) {
  const maxW = ctx.W * (ctx.portrait ? 0.84 : 0.82);
  const maxH = ctx.H * (withHeadline ? (ctx.portrait ? 0.42 : 0.6) : (ctx.portrait ? 0.55 : 0.72));
  return fitBox(aspect, maxW, maxH);
}

export const tiltedPanel = {
  defaults: { chrome: 'window', headlinePosition: 'above' },
  build(root, p, ctx, dur) {
    const probe = ctx.asset(p.media);
    const { w, h } = panelLayout(ctx, probe.width / probe.height, Boolean(p.headline));
    const headH = p.headline ? ctx.style.type.title * ctx.u * 2.6 : 0;
    const above = p.headlinePosition !== 'below';
    const cy = ctx.H / 2 + (p.headline ? (above ? headH / 2 : -headH / 2) : 0);
    const pan = panel(ctx, root, { w, h: h + (p.chrome === 'window' ? h * 0.045 : 0), cx: ctx.W / 2, cy, chrome: p.chrome });
    const m = media(ctx, pan.body, p.media);
    if (p.badge) {
      const badge = el('div', { position: 'absolute', right: px(ctx.u * 2), top: px(ctx.u * 2), padding: `${px(ctx.u * 0.9)} ${px(ctx.u * 2)}`, borderRadius: px(ctx.u * 4), background: ctx.accent, color: ctx.accentInk, fontFamily: `"${ctx.font('body').family}"`, fontWeight: '600', fontSize: px(Math.max(ctx.u * 2.6, 30 * ctx.pxScale)), zIndex: '5' }, pan.body);
      badge.textContent = p.badge;
    }
    const head = headlineBlock(ctx, root, p.headline, { y: above ? cy - (h / 2) - headH * 0.55 : cy + h / 2 + headH * 0.55 });
    const bodyH = pan.h - pan.barH;
    const steps = (p.cursor || []).map((s) => ({ t: ctx.sec(s.at), x: s.point[0] * w, y: s.point[1] * bodyH, click: s.click }));
    const cur = steps.length ? cursor(ctx, pan.body, steps) : null;
    ctx.cue(0, 'whoosh');
    const tilt = p.tilt || ctx.style.panel.tilt;
    const enter = ctx.style.motion.enterMs / 1000;
    return {
      update(t) {
        pan.pose(prog(t, 0, enter, ctx.style.motion.enterEase), t / Math.max(1, dur), tilt);
        m.update(t);
        if (cur) cur.update(t);
        if (head) head.reveal(t, 0.15);
      },
    };
  },
};

export const uiFocus = {
  defaults: {},
  build(root, p, ctx, dur) {
    const probe = ctx.asset(p.media);
    const { w, h } = panelLayout(ctx, probe.width / probe.height, Boolean(p.headline));
    const pan = panel(ctx, root, { w, h, cx: ctx.W / 2, cy: ctx.H / 2, chrome: 'plain' });
    const m = media(ctx, pan.body, p.media);
    const [fx, fy, fw, fh] = p.focus;
    const zoomAt = p.zoomAt != null ? ctx.sec(p.zoomAt) : dur * 0.22;
    const targetW = ctx.W * (ctx.portrait ? 0.86 : 0.8), targetH = ctx.H * (p.headline ? 0.56 : 0.72);
    const scale = Math.min(targetW / (fw * w), targetH / (fh * h));
    const focusCx = (fx + fw / 2 - 0.5) * w, focusCy = (fy + fh / 2 - 0.5) * h;
    const ring = el('div', { position: 'absolute', left: px(fx * w), top: px(fy * h), width: px(fw * w), height: px(fh * h), borderRadius: px(ctx.u * 0.8 / scale), boxShadow: `0 0 0 ${px(ctx.u * 0.35 / scale)} ${ctx.accent}, 0 0 ${px(ctx.u * 3 / scale)} ${rgba(ctx.accent, 0.5)}`, opacity: '0' }, pan.body);
    const dim = el('div', { position: 'absolute', left: px(fx * w), top: px(fy * h), width: px(fw * w), height: px(fh * h), borderRadius: px(ctx.u * 0.8 / scale), boxShadow: `0 0 0 ${px(Math.max(w, h) * 2)} ${ctx.pal.bg}`, opacity: '0', pointerEvents: 'none' }, pan.body);
    // A time past the scene end is never drawn; its cue would sound over the next scene.
    const late = (t, what) => t >= dur && (ctx.warn(`${what} is at ${t.toFixed(2)} s, at or past the end of the ${dur.toFixed(2)} s scene, so it never shows; make the scene longer or move it earlier (at counts beats when the storyboard has a tempo)`), true);
    const clickT = p.clickAt != null ? ctx.sec(p.clickAt) : zoomAt + 0.9;
    const steps = p.click ? [{ t: clickT - 0.7, x: (p.click[0] + 0.12) * w, y: (p.click[1] + 0.14) * h }, { t: clickT, x: p.click[0] * w, y: p.click[1] * h, click: !late(clickT, 'the click (clickAt)') }] : [];
    const cur = steps.length ? cursor(ctx, pan.body, steps) : null;
    if (cur) cur.node.style.width = px(parseFloat(cur.node.style.width) / scale), cur.node.style.height = px(parseFloat(cur.node.style.height) / scale);
    const headAt = p.headlineAt != null ? ctx.sec(p.headlineAt) : zoomAt + 0.3;
    const head = p.headline ? headlineBlock(ctx, root, p.headline, { y: ctx.H * (ctx.portrait ? 0.86 : 0.88), size: 'title' }) : null;

    ctx.cue(0, 'whoosh');
    if (!late(zoomAt, 'the zoom (zoomAt)')) ctx.cue(zoomAt, 'swish', -3);
    return {
      update(t) {
        const pe = prog(t, 0, ctx.style.motion.enterMs / 1000, ctx.style.motion.enterEase);
        const z = prog(t, zoomAt, 0.8, 'inOut');
        const s = lerp(1, scale, z);
        const tilt = ctx.style.panel.tilt.map((d) => d * (1 - z));
        pan.pose(pe, (t / Math.max(1, dur)) * (1 - z), tilt, { scale: s, tx: -focusCx * s * z, ty: -focusCy * s * z + (head ? -ctx.H * 0.06 * z : 0) });
        ring.style.opacity = String(prog(t, zoomAt + 0.6, 0.3, 'out'));
        dim.style.opacity = String(0.82 * prog(t, zoomAt + 0.2, 0.6, 'inOut'));
        m.update(t);
        if (cur) cur.update(t);
        if (head) head.reveal(t, headAt);
      },
    };
  },
};

export const promptType = {
  defaults: { placeholder: 'Ask anything', sendLabel: '' },
  build(root, p, ctx, dur) {
    const boxW = ctx.W * (ctx.portrait ? 0.9 : 0.62);
    const f = ctx.font('body');
    const fontPx = Math.max(ctx.style.type.body * ctx.u, 44 * ctx.pxScale);
    const pad = ctx.u * 3.2;
    const sendSize = ctx.u * 9;
    const textW = boxW - pad * 3 - sendSize;
    const block = textBlock(ctx, root, p.text, { size: 'body', font: 'body', maxWidth: textW, maxLines: 4, align: 'left', color: ctx.pal.panelInk || ctx.pal.ink });
    const boxH = Math.max(block.height + pad * 2 + sendSize * 0.4, ctx.u * 20);
    const cx = ctx.W / 2, cy = ctx.H / 2 + (p.label ? ctx.u * 5 : 0);
    const wrap = el('div', { position: 'absolute', left: px(cx - boxW / 2), top: px(cy - boxH / 2), width: px(boxW), height: px(boxH), perspective: px(ctx.style.panel.perspective) }, root);
    const box = el('div', { position: 'absolute', inset: '0', borderRadius: px(ctx.u * 4), background: ctx.pal.panel, boxShadow: ctx.shadow(), border: `1px solid ${ctx.pal.line}` }, wrap);
    if (ctx.style.panel.glow) box.style.boxShadow += `, ${ctx.style.panel.glow.replace('ACCENT', ctx.accent)}`;
    box.appendChild(block.node);
    block.node.style.left = px(pad); block.node.style.top = px(pad);
    const ph = el('div', { position: 'absolute', left: px(pad), top: px(pad), fontFamily: `"${f.family}"`, fontSize: px(block.size), color: ctx.pal.panelMuted || ctx.pal.muted }, box);
    ph.textContent = p.placeholder;
    const send = el('div', { position: 'absolute', right: px(pad * 0.8), bottom: px(pad * 0.8), width: px(sendSize), height: px(sendSize), borderRadius: '50%', background: ctx.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }, box);
    send.innerHTML = `<svg viewBox="0 0 24 24" width="48%" height="48%"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="${ctx.accentInk}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const label = p.label ? textBlock(ctx, root, p.label, { size: 'title', maxWidth: ctx.W * 0.86, maxLines: 2 }) : null;
    if (label) { label.node.style.left = px(ctx.W / 2 - label.width / 2); label.node.style.top = px(cy - boxH / 2 - label.height - ctx.u * 5); }
    const typeFrom = p.typeFrom != null ? ctx.sec(p.typeFrom) : 0.45;
    const typeTo = p.typeTo != null ? ctx.sec(p.typeTo) : dur * 0.7;
    const clickAt = p.clickAt != null ? ctx.sec(p.clickAt) : Math.min(dur - 0.25, typeTo + 0.45);
    const sx = boxW - pad * 0.8 - sendSize / 2, sy = boxH - pad * 0.8 - sendSize / 2;
    const cur = cursor(ctx, box, [{ t: typeTo - 0.1, x: sx + ctx.u * 12, y: sy + ctx.u * 10 }, { t: clickAt, x: sx, y: sy, click: true }]);
    const chars = block.words.map((w, i) => w.text + (i < block.words.length - 1 ? ' ' : ''));
    const total = chars.join('').length;
    ctx.cue(typeFrom, 'typing');
    ctx.cue(0, 'whoosh', -4);
    let caretNode = null;
    return {
      update(t) {
        const pe = prog(t, 0, ctx.style.motion.enterMs / 1000, ctx.style.motion.enterEase);
        box.style.transform = `translateY(${px((1 - pe) * ctx.u * 12)}) rotateX(${(1 - pe) * 25}deg) scale(${lerp(0.9, 1, pe)})`;
        box.style.opacity = String(clamp01(pe * 2));
        box.style.filter = pe < 0.98 ? `blur(${px((1 - pe) * 10)})` : 'none';
        const shown = Math.floor(clamp01((t - typeFrom) / Math.max(0.1, typeTo - typeFrom)) * total);
        let k = 0;
        block.words.forEach((w, i) => {
          const n = Math.max(0, Math.min(chars[i].length, shown - k));
          w.node.textContent = chars[i].slice(0, n);
          w.node.style.opacity = '1'; w.node.style.filter = 'none'; w.node.style.transform = 'none';
          k += chars[i].length;
          if (n > 0 && (n < chars[i].length || i === block.words.length - 1 || shown === k)) caretNode = w.node;
        });
        ph.style.opacity = shown > 0 ? '0' : '1';
        root.querySelectorAll('.pcaret').forEach((c) => c.remove());
        const host = shown > 0 ? caretNode : ph;
        if (host && t < clickAt && (Math.floor(t * 2.4) % 2 === 0 || (t > typeFrom && t < typeTo))) {
          el('span', { display: 'inline-block', width: px(Math.max(2, block.size * 0.07)), height: px(block.size * 0.95), verticalAlign: '-0.12em', marginLeft: px(2), background: ctx.accent }, host, 'pcaret');
        }
        const press = Math.sin(Math.PI * clamp01((t - clickAt + 0.06) / 0.22));
        send.style.transform = `scale(${1 - 0.14 * press})`;
        send.style.boxShadow = t > clickAt ? `0 0 0 ${px(prog(t, clickAt, 0.5) * ctx.u * 3)} ${rgba(ctx.accent, 0.35 * (1 - prog(t, clickAt, 0.5)))}` : 'none';
        cur.update(t);
        if (label) label.reveal(t, 0.1);
      },
    };
  },
};

export const buttonPress = {
  defaults: { variant: 'solid' },
  build(root, p, ctx, dur) {
    const f = ctx.font('body');
    const m100 = measurer(f.family, 600, 0);
    const longest = Math.max(m100(p.label, 100), m100(`✓ ${p.resultLabel || ''}`, 100));
    const fontPx = Math.min(Math.max(ctx.style.type.body * ctx.u * 1.1, 46 * ctx.pxScale), ((ctx.W * 0.86 - 2.4 * 46 * ctx.pxScale) * 100) / longest);
    if (fontPx < 44 * ctx.pxScale) ctx.warn(`button label too long: "${p.label}"`);
    const h = fontPx * 2.4;
    const w = Math.min(ctx.W * 0.9, (longest * fontPx) / 100 + fontPx * 2.4);
    const cx = ctx.W / 2, cy = ctx.H / 2 + (p.headline ? ctx.u * 6 : 0);
    const btn = el('div', { position: 'absolute', left: px(cx - w / 2), top: px(cy - h / 2), width: px(w), height: px(h), borderRadius: px(h / 2), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: `"${f.family}"`, fontWeight: '600', fontSize: px(fontPx), whiteSpace: 'nowrap' }, root);
    if (p.variant === 'outline') Object.assign(btn.style, { border: `${px(ctx.u * 0.3)} solid ${ctx.accent}`, color: ctx.accent, background: ctx.pal.panel });
    else Object.assign(btn.style, { background: ctx.accent, color: ctx.accentInk, boxShadow: p.variant === 'glow' ? `0 0 ${px(ctx.u * 5)} ${rgba(ctx.accent, 0.7)}, inset 0 0 0 1px ${rgba('#ffffff', 0.35)}` : ctx.shadow(0.6) });
    const a = el('span', { position: 'absolute' }, btn); a.textContent = p.label;
    const b = el('span', { position: 'absolute', opacity: '0' }, btn); b.textContent = p.resultLabel ? `✓ ${p.resultLabel}` : '';
    const clickAt = p.clickAt != null ? ctx.sec(p.clickAt) : dur * 0.55;
    const cur = cursor(ctx, root, [{ t: clickAt - 0.6, x: cx + w * 0.42, y: cy + h * 1.6 }, { t: clickAt, x: cx + w * 0.12, y: cy + h * 0.1, click: true }]);
    const head = headlineBlock(ctx, root, p.headline, { y: cy - h * 1.6 });
    return {
      update(t) {
        const pe = prog(t, 0, ctx.style.motion.enterMs / 1000, 'back');
        const press = Math.sin(Math.PI * clamp01((t - clickAt + 0.06) / 0.24));
        btn.style.transform = `scale(${lerp(0.6, 1, pe) * (1 - 0.08 * press)})`;
        btn.style.opacity = String(clamp01(pe * 2));
        if (p.resultLabel) { const sw = prog(t, clickAt + 0.12, 0.3, 'out'); a.style.opacity = String(1 - sw); b.style.opacity = String(sw); a.style.filter = `blur(${px(sw * 6)})`; b.style.filter = `blur(${px((1 - sw) * 6)})`; }
        cur.update(t);
        if (head) head.reveal(t, 0.1);
      },
    };
  },
};

function parseRatio(r) { const [a, b] = r.split(':').map(Number); return a / b; }

export const aspectMorph = {
  defaults: { ratios: ['16:9', '4:5', '9:16'], showLabels: true },
  build(root, p, ctx, dur) {
    const ratios = p.ratios.map(parseRatio);
    const labelPx = Math.max(ctx.style.type.title * ctx.u, 48 * ctx.pxScale);
    const maxW = ctx.W * (ctx.portrait ? 0.84 : 0.5), maxH = ctx.H * (ctx.portrait ? 0.56 : 0.66);
    const boxes = ratios.map((r) => fitBox(r, maxW, maxH));
    const cx = ctx.portrait ? ctx.W / 2 : ctx.W * 0.42, cy = ctx.portrait ? ctx.H * 0.44 : ctx.H / 2;
    const frame = el('div', { position: 'absolute', overflow: 'hidden', borderRadius: px(ctx.u * 2), background: ctx.pal.panel, boxShadow: ctx.shadow(), border: `1px solid ${ctx.pal.line}` }, root);
    const list = (p.medias || [p.media]).map((spec) => media(ctx, frame, spec));
    const labels = p.showLabels ? p.ratios.map((r) => el('div', { position: 'absolute', fontFamily: `"${ctx.font('display').family}"`, fontWeight: String(ctx.font('display').weight), fontSize: px(labelPx * 1.5), color: ctx.pal.ink, whiteSpace: 'nowrap', opacity: '0', letterSpacing: '-0.02em' }, root, '')) : [];
    labels.forEach((l, i) => { l.textContent = p.ratios[i]; });
    const step = dur / ratios.length;
    ratios.forEach((_, i) => i && ctx.cue(i * step - 0.2, 'swish', -4));
    return {
      update(t) {
        let bw = boxes[0].w, bh = boxes[0].h;
        for (let i = 1; i < ratios.length; i++) {
          const q = prog(t, i * step - 0.35, 0.5, 'inOut');
          bw = lerp(bw, boxes[i].w, q); bh = lerp(bh, boxes[i].h, q);
        }
        const pe = prog(t, 0, 0.5, ctx.style.motion.enterEase);
        Object.assign(frame.style, { left: px(cx - bw / 2), top: px(cy - bh / 2), width: px(bw), height: px(bh), transform: `scale(${lerp(0.85, 1, pe)})`, opacity: String(clamp01(pe * 2)) });
        list.forEach((m, i) => {
          const fadeIn = i === 0 ? 1 : prog(t, i * step - 0.3, 0.35, 'inOut');
          m.node.style.opacity = String(fadeIn);
          m.update(t);
        });
        labels.forEach((l, i) => {
          const on = prog(t, i * step - 0.15, 0.35, 'out') * (1 - prog(t, (i + 1) * step - 0.3, 0.25, 'in'));
          const lx = ctx.portrait ? ctx.W / 2 : cx + maxW / 2 + ctx.W * 0.04;
          const ly = ctx.portrait ? ctx.H * 0.86 : ctx.H / 2;
          l.style.left = px(lx); l.style.top = px(ly);
          l.style.transform = `translate(${ctx.portrait ? '-50%' : '0'}, -50%) translateY(${px((1 - on) * ctx.u * 3)})`;
          l.style.opacity = String(i === ratios.length - 1 ? prog(t, i * step - 0.15, 0.35, 'out') : on);
          l.style.filter = on < 0.98 ? `blur(${px((1 - on) * 10)})` : 'none';
        });
      },
    };
  },
};

export const deviceFrame = {
  defaults: { device: 'laptop', side: 'center' },
  build(root, p, ctx, dur) {
    const probe = ctx.asset(p.media);
    const dark = (ctx.style.deviceTone || 'dark') === 'dark';
    const bezel = dark ? '#111214' : '#e6e6ea';
    const side = ctx.portrait ? 'center' : p.side;
    const areaW = ctx.W * (side === 'center' ? (ctx.portrait ? 0.9 : 0.66) : 0.5);
    const areaH = ctx.H * (p.headline && (side === 'center') ? 0.58 : 0.74);
    const isPhone = p.device === 'phone';
    const screenAspect = isPhone ? 9 / 19.5 : p.device === 'tablet' ? 4 / 3 : 16 / 10;
    const { w: sw, h: sh } = fitBox(screenAspect, areaW * (isPhone ? 1 : 0.92), areaH * (p.device === 'laptop' ? 0.86 : p.device === 'monitor' ? 0.8 : 1));
    const cx = side === 'left' ? ctx.W * 0.3 : side === 'right' ? ctx.W * 0.7 : ctx.W / 2;
    const cy = ctx.H / 2 + (p.headline && side === 'center' ? ctx.H * 0.08 : 0) - (p.device === 'monitor' ? sh * 0.08 : 0);
    const wrap = el('div', { position: 'absolute', left: px(cx - sw / 2), top: px(cy - sh / 2), width: px(sw), height: px(sh), perspective: px(ctx.style.panel.perspective * 1.4) }, root);
    const dev = el('div', { position: 'absolute', inset: '0', transformStyle: 'preserve-3d' }, wrap);
    const border = isPhone ? sw * 0.045 : sw * 0.018;
    const radius = isPhone ? sw * 0.16 : sw * 0.025;
    const screen = el('div', { position: 'absolute', inset: '0', borderRadius: px(radius), background: bezel, boxShadow: ctx.shadow(1.2), padding: px(border) }, dev);
    const glass = el('div', { position: 'relative', width: '100%', height: '100%', borderRadius: px(Math.max(2, radius - border)), overflow: 'hidden', background: '#000' }, screen);
    const m = media(ctx, glass, p.media, { objectFit: 'cover', objectPosition: 'top center' });
    if (isPhone) el('div', { position: 'absolute', left: '50%', top: px(border * 1.6), width: px(sw * 0.28), height: px(sw * 0.075), marginLeft: px(-sw * 0.14), borderRadius: px(sw * 0.05), background: '#000' }, screen);
    if (p.device === 'laptop') el('div', { position: 'absolute', left: px(-sw * 0.07), right: px(-sw * 0.07), top: px(sh - 1), height: px(sh * 0.05), borderRadius: `0 0 ${px(sw * 0.03)} ${px(sw * 0.03)}`, background: `linear-gradient(180deg, ${mix(bezel, '#ffffff', 0.2)}, ${bezel})`, boxShadow: ctx.shadow(0.6) }, dev);
    if (p.device === 'monitor') {
      el('div', { position: 'absolute', left: px(sw * 0.44), width: px(sw * 0.12), top: px(sh), height: px(sh * 0.16), background: `linear-gradient(90deg, ${bezel}, ${mix(bezel, '#ffffff', 0.25)}, ${bezel})` }, dev);
      el('div', { position: 'absolute', left: px(sw * 0.32), width: px(sw * 0.36), top: px(sh * 1.15), height: px(sh * 0.035), borderRadius: px(sw * 0.02), background: bezel, boxShadow: ctx.shadow(0.5) }, dev);
    }
    let head = null;
    if (p.headline) {
      if (side === 'center') head = headlineBlock(ctx, root, p.headline, { y: cy - sh / 2 - ctx.H * 0.1 });
      else {
        head = textBlock(ctx, root, p.headline, { size: 'title', maxWidth: ctx.W * 0.36, maxLines: 3, align: 'left' });
        head.node.style.left = px(side === 'left' ? ctx.W * 0.58 : ctx.W * 0.08);
        head.node.style.top = px(ctx.H / 2 - head.height / 2);
      }
    }
    ctx.cue(0, 'whoosh');
    return {
      update(t) {
        const d = t / Math.max(1, dur);
        const swing = side === 'left' ? 1 : side === 'right' ? -1 : 0;
        if (ctx.style.motion.deviceEntry === 'pullBack') {
          // Start with the screen filling the frame, then pull back to the whole device.
          const pe = prog(t, 0, ctx.style.motion.enterMs / 1000, ctx.style.motion.enterEase);
          const fill = Math.max(ctx.W / (sw - border * 2), ctx.H / (sh - border * 2)) * 1.02;
          const s = lerp(fill, 1, pe);
          const tx = lerp(ctx.W / 2 - cx, 0, pe), ty = lerp(ctx.H / 2 - cy, 0, pe);
          dev.style.transform = `translate(${px(tx)}, ${px(ty)}) rotateY(${pe * (swing * 12 + d * -3)}deg) rotateX(${pe * 4}deg) scale(${s})`;
          dev.style.opacity = '1';
        } else {
          const pe = prog(t, 0, (ctx.style.motion.enterMs / 1000) * 1.3, ctx.style.motion.enterEase);
          dev.style.transform = `translateY(${px((1 - pe) * ctx.H * 0.25)}) rotateY(${(1 - pe) * -30 + swing * 12 + d * -4}deg) rotateX(${(1 - pe) * 12 + 4}deg) scale(${lerp(0.85, 1, pe) * (1 + d * 0.03)})`;
          dev.style.opacity = String(clamp01(pe * 2));
        }
        m.update(t);
        if (head) head.reveal(t, 0.25);
      },
    };
  },
};
