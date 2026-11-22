// Status and data scenes: tiles, doneBurst, statCounter, featureList, notificationStack, chartReveal.
import { el, px, prog, lerp, clamp01, textBlock, media, confetti, rgba, mix, ease, measurer } from '../kit.js';

const CHECK = (color, width) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M5 12.5 10 17.5 19.5 7" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="0"/></svg>`;

function label(ctx, parent, text, { sizePx, weight, color, font = 'body' }) {
  const f = ctx.font(font);
  const n = el('div', { position: 'absolute', fontFamily: `"${f.family}"`, fontWeight: String(weight ?? f.weight), fontSize: px(sizePx), color: color || ctx.pal.ink, whiteSpace: 'nowrap', lineHeight: '1.15' }, parent);
  n.textContent = text;
  return n;
}

const minFont = (ctx, u) => Math.max(u * ctx.u, 44 * ctx.pxScale);

function rise(node, p, ctx, k = 4) {
  node.style.opacity = String(clamp01(p * 1.6));
  node.style.transform = `translateY(${px((1 - p) * ctx.u * k)})`;
  node.style.filter = p < 0.98 ? `blur(${px((1 - p) * 8)})` : 'none';
}

export const tiles = {
  defaults: {},
  build(root, p, ctx, dur) {
    const n = p.labels.length;
    const cols = ctx.portrait ? 2 : n <= 4 ? n : Math.ceil(n / (n > 6 ? 2 : 1));
    const rows = Math.ceil(n / cols);
    const areaW = ctx.W * (ctx.portrait ? 0.9 : 0.88);
    const gap = ctx.u * 1.8;
    const tw = (areaW - gap * (cols - 1)) / cols;
    const th = Math.min(tw * 0.72, ctx.H * (ctx.portrait ? 0.13 : 0.2));
    const gridH = rows * th + (rows - 1) * gap;
    const barH = ctx.u * 3.2;
    const statusPx = minFont(ctx, ctx.style.type.body);
    const blockH = gridH + ctx.u * 6 + barH + ctx.u * 4 + statusPx * 1.2;
    const top = ctx.H / 2 - blockH / 2;
    const df = ctx.font('display');
    const widest = Math.max(...p.labels.map((l) => measurer(df.family, 600, 0)(l, 100)));
    const fontPx = Math.min(minFont(ctx, ctx.style.type.body), tw * 0.2, (tw * 0.8 * 100) / widest);
    if (fontPx < 30 * ctx.pxScale) ctx.warn(`tile labels too long for ${cols} columns: ${p.labels.join(', ')}`);
    const every = p.every != null ? ctx.sec(p.every) : (dur * 0.62) / n;
    const lightStart = dur * 0.12;
    const items = p.labels.map((text, i) => {
      const x = ctx.W / 2 - areaW / 2 + (i % cols) * (tw + gap), y = top + Math.floor(i / cols) * (th + gap);
      const card = el('div', { position: 'absolute', left: px(x), top: px(y), width: px(tw), height: px(th), borderRadius: px(ctx.u * 1.8), background: ctx.pal.panel, border: `1px solid ${ctx.pal.line}`, boxShadow: ctx.shadow(0.5), overflow: 'hidden' }, root);
      const fill = el('div', { position: 'absolute', inset: '0', background: `linear-gradient(135deg, ${ctx.accent}, ${mix(ctx.accent, '#ffffff', 0.3)})`, opacity: '0' }, card);
      const num = label(ctx, card, String(i + 1).padStart(2, '0'), { sizePx: fontPx * 0.62, weight: 600, color: ctx.pal.panelMuted || ctx.pal.muted });
      Object.assign(num.style, { left: px(tw * 0.1), top: px(th * 0.14) });
      const name = label(ctx, card, text, { sizePx: fontPx, weight: 600, font: 'display', color: ctx.pal.panelInk || ctx.pal.ink });
      Object.assign(name.style, { left: px(tw * 0.1), bottom: px(th * 0.14) });
      const tick = el('div', { position: 'absolute', right: px(tw * 0.08), top: px(th * 0.12), width: px(fontPx * 0.9), height: px(fontPx * 0.9), opacity: '0' }, card);
      tick.innerHTML = CHECK(ctx.accentInk, 3);
      const on = lightStart + i * every;
      ctx.cue(on, 'tick', -4);
      return { card, fill, num, name, tick, on, delay: i * 0.06 };
    });
    const barY = top + gridH + ctx.u * 6;
    const track = el('div', { position: 'absolute', left: px(ctx.W / 2 - areaW / 2), top: px(barY), width: px(areaW), height: px(barH), borderRadius: px(barH), background: rgba(ctx.pal.ink, 0.08) }, root);
    const bar = el('div', { position: 'absolute', left: '0', top: '0', bottom: '0', borderRadius: px(barH), background: `linear-gradient(90deg, ${mix(ctx.accent, '#ffffff', 0.6)}, ${ctx.accent} 60%, ${mix(ctx.accent, '#ffffff', 0.35)})`, boxShadow: `0 ${px(ctx.u * 1.5)} ${px(ctx.u * 4)} ${rgba(ctx.accent, 0.35)}`, width: '0' }, track);
    const status = p.status ? label(ctx, root, p.status, { sizePx: statusPx, weight: 500, color: ctx.pal.muted }) : null;
    const statusAt = lightStart + n * every;
    if (status) Object.assign(status.style, { left: '0', width: px(ctx.W), textAlign: 'center', top: px(barY + barH + ctx.u * 4) });
    const pct = p.progressLabel ? label(ctx, root, '', { sizePx: statusPx, weight: 600, color: ctx.accent }) : null;
    if (pct) Object.assign(pct.style, { right: px(ctx.W / 2 - areaW / 2), top: px(barY - statusPx * 1.5) });
    ctx.cue(0, 'whoosh', -2);
    return {
      update(t) {
        items.forEach((it) => {
          const pe = prog(t, it.delay, 0.55, ctx.style.motion.enterEase);
          it.card.style.opacity = String(clamp01(pe * 2));
          it.card.style.transform = `translateY(${px((1 - pe) * ctx.H * 0.18)}) rotateX(${(1 - pe) * 40}deg) scale(${lerp(0.8, 1, pe)})`;
          it.card.style.filter = pe < 0.98 ? `blur(${px((1 - pe) * 10)})` : 'none';
          const lit = prog(t, it.on, 0.3, 'out');
          it.fill.style.opacity = String(lit);
          it.name.style.color = lit > 0.5 ? ctx.accentInk : (ctx.pal.panelInk || ctx.pal.ink);
          it.num.style.color = lit > 0.5 ? rgba(ctx.accentInk, 0.75) : (ctx.pal.panelMuted || ctx.pal.muted);
          it.tick.style.opacity = String(prog(t, it.on + 0.1, 0.25));
          it.card.style.transform += ` scale(${1 + 0.06 * Math.sin(Math.PI * clamp01((t - it.on) / 0.3))})`;
        });
        const fillP = clamp01((t - lightStart) / (n * every));
        bar.style.width = `${(ease('inOut')(fillP) * 100).toFixed(3)}%`;
        track.style.opacity = String(prog(t, 0.2, 0.4));
        if (pct) { pct.textContent = `${Math.round(fillP * 100)}%`; pct.style.opacity = track.style.opacity; }
        if (status) rise(status, prog(t, statusAt, 0.45, 'out'), ctx);
      },
    };
  },
};

export const doneBurst = {
  defaults: { label: 'Done' },
  build(root, p, ctx, dur) {
    const variant = p.variant || ctx.style.doneVariant || 'confetti';
    const size = ctx.u * 30;
    const cx = ctx.W / 2, cy = ctx.H / 2 + ctx.u * 7;
    const cols = (ctx.style.palette.confetti || ['accent']).map((c) => (c === 'accent' ? ctx.accent : c === 'accentLight' ? mix(ctx.accent, '#ffffff', 0.45) : c === 'accentDark' ? mix(ctx.accent, '#000000', 0.25) : c));
    const burst = variant === 'confetti' ? confetti(ctx, root, { cx, cy, colors: cols, count: 70 }) : null;
    const disc = el('div', { position: 'absolute', left: px(cx - size / 2), top: px(cy - size / 2), width: px(size), height: px(size), borderRadius: '50%', background: variant === 'ring' ? 'transparent' : ctx.pal.panel, boxShadow: variant === 'ring' ? 'none' : `${ctx.shadow(0.8)}, inset 0 0 ${px(size * 0.2)} ${rgba(ctx.accent, 0.12)}` }, root);
    const ring = el('div', { position: 'absolute', inset: '0', filter: variant === 'ring' && ctx.style.panel.glow ? `drop-shadow(0 0 ${px(ctx.u * 1.6)} ${rgba(ctx.accent, 0.8)})` : 'none' }, disc);
    ring.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%"><circle cx="50" cy="50" r="46" fill="none" stroke="${ctx.accent}" stroke-width="${variant === 'ring' ? 5 : 2.5}" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-90 50 50)"/></svg>`;
    const check = el('div', { position: 'absolute', left: '22%', top: '22%', width: '56%', height: '56%' }, disc);
    check.innerHTML = CHECK(ctx.accent, variant === 'ring' ? 2.6 : 1.8);
    const circle = ring.querySelector('circle'), path = check.querySelector('path');
    const word = textBlock(ctx, root, p.label, { size: 'hero', maxWidth: ctx.W * 0.8, maxLines: 1 });
    word.node.style.left = px(cx - word.width / 2); word.node.style.top = px(cy - size / 2 - word.height - ctx.u * 3);
    const sub = p.sub ? textBlock(ctx, root, p.sub, { size: 'body', font: 'body', maxWidth: ctx.W * 0.8, maxLines: 2, color: ctx.pal.muted }) : null;
    if (sub) { sub.node.style.left = px(cx - sub.width / 2); sub.node.style.top = px(cy + size / 2 + ctx.u * 4); }
    const burstAt = 0.38;
    ctx.cue(burstAt, 'pop');
    return {
      update(t) {
        const pd = prog(t, 0, (ctx.style.motion.popMs ?? 450) / 1000, ctx.style.motion.popEase || 'back');
        disc.style.transform = `scale(${pd * (1 + 0.08 * Math.sin(Math.PI * clamp01((t - burstAt) / 0.25)))})`;
        circle.setAttribute('stroke-dashoffset', String(1 - prog(t, 0.05, 0.5, 'inOut')));
        path.setAttribute('stroke-dashoffset', String(1 - prog(t, 0.3, 0.35, 'out')));
        word.reveal(t, 0.1);
        if (burst) burst.update(t - burstAt);
        if (sub) sub.reveal(t, 0.6);
      },
    };
  },
};

export const statCounter = {
  defaults: { from: 0, decimals: 0, suffix: '', prefix: '', bar: true },
  build(root, p, ctx, dur) {
    const numPx = ctx.style.type.hero * ctx.u * 1.5;
    const f = ctx.font('display');
    const num = el('div', { position: 'absolute', left: '0', width: px(ctx.W), textAlign: 'center', top: px(ctx.H * 0.5 - numPx * 1.05), fontFamily: `"${f.family}"`, fontWeight: String(f.weight), fontSize: px(numPx), color: ctx.pal.ink, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', whiteSpace: 'nowrap' }, root);
    const barW = ctx.W * (ctx.portrait ? 0.8 : 0.56), barH = ctx.u * 3;
    const track = p.bar ? el('div', { position: 'absolute', left: px(ctx.W / 2 - barW / 2), top: px(ctx.H * 0.5 + ctx.u * 3), width: px(barW), height: px(barH), borderRadius: px(barH), background: rgba(ctx.pal.ink, 0.08), overflow: 'hidden' }, root) : null;
    const bar = track ? el('div', { position: 'absolute', left: '0', top: '0', bottom: '0', width: '0', borderRadius: px(barH), background: `linear-gradient(90deg, ${mix(ctx.accent, '#ffffff', 0.5)}, ${ctx.accent})`, boxShadow: `0 0 ${px(ctx.u * 3)} ${rgba(ctx.accent, 0.4)}` }, track) : null;
    const lab = p.label ? textBlock(ctx, root, p.label, { size: 'body', font: 'body', maxWidth: ctx.W * 0.84, maxLines: 2, color: ctx.pal.muted }) : null;
    if (lab) { lab.node.style.left = px(ctx.W / 2 - lab.width / 2); lab.node.style.top = px(ctx.H * 0.5 + ctx.u * 10); }
    const countEnd = dur * 0.7;
    ctx.cue(countEnd, 'tick');
    return {
      update(t) {
        const q = prog(t, 0.15, countEnd - 0.15, [0.3, 0.6, 0.2, 1]);
        const v = lerp(p.from, p.to, q);
        num.innerHTML = '';
        el('span', {}, num).textContent = `${p.prefix}${v.toFixed(p.decimals)}`;
        if (p.suffix) el('span', { color: ctx.pal.muted, opacity: '0.55' }, num).textContent = p.suffix;
        rise(num, prog(t, 0, 0.4), ctx, 3);
        if (bar) { bar.style.width = `${(q * 100).toFixed(3)}%`; track.style.opacity = String(prog(t, 0, 0.3)); }
        if (lab) lab.reveal(t, 0.3);
      },
    };
  },
};

export const featureList = {
  defaults: {},
  build(root, p, ctx, dur) {
    const split = Boolean(p.media) && !ctx.portrait;
    const colW = ctx.W * (split ? 0.4 : ctx.portrait ? 0.84 : 0.6);
    const left = split ? ctx.W * 0.07 : ctx.W / 2 - colW / 2;
    const itemPx = minFont(ctx, ctx.style.type.body);
    const title = p.title ? textBlock(ctx, root, p.title, { size: 'title', maxWidth: colW, maxLines: 2, align: 'left' }) : null;
    const rowH = itemPx * 1.9;
    const total = (title ? title.height + ctx.u * 4 : 0) + p.items.length * rowH;
    let y = (ctx.portrait && p.media ? ctx.H * 0.62 : ctx.H / 2) - total / 2;
    if (title) { title.node.style.left = px(left); title.node.style.top = px(y); y += title.height + ctx.u * 4; }
    const every = (dur * 0.6) / p.items.length;
    const rows = p.items.map((text, i) => {
      const row = el('div', { position: 'absolute', left: px(left), top: px(y + i * rowH), width: px(colW), height: px(rowH) }, root);
      const dot = el('div', { position: 'absolute', left: '0', top: px(rowH / 2 - itemPx * 0.55), width: px(itemPx * 1.1), height: px(itemPx * 1.1), borderRadius: '50%', background: ctx.accent, padding: px(itemPx * 0.2) }, row);
      dot.innerHTML = CHECK(ctx.accentInk, 3.2);
      const t = label(ctx, row, text, { sizePx: itemPx, weight: 500 });
      Object.assign(t.style, { left: px(itemPx * 1.6), top: px(rowH / 2 - itemPx * 0.58), whiteSpace: 'normal', width: px(colW - itemPx * 1.6) });
      ctx.cue(0.3 + i * every, 'tick', -6);
      return { row, at: 0.3 + i * every };
    });
    let pan = null, m = null;
    if (p.media) {
      const probe = ctx.asset(p.media);
      const boxW = ctx.portrait ? ctx.W * 0.84 : ctx.W * 0.44;
      const boxH = ctx.portrait ? ctx.H * 0.34 : ctx.H * 0.62;
      const a = probe.width / probe.height;
      const w = a > boxW / boxH ? boxW : boxH * a, h = w / a;
      pan = el('div', { position: 'absolute', left: px(ctx.portrait ? ctx.W / 2 - w / 2 : ctx.W * 0.73 - w / 2), top: px(ctx.portrait ? ctx.H * 0.24 - h / 2 : ctx.H / 2 - h / 2), width: px(w), height: px(h), borderRadius: px(ctx.style.panel.radius * w), overflow: 'hidden', boxShadow: ctx.shadow(), background: ctx.pal.panel }, root);
      m = media(ctx, pan, p.media);
    }
    return {
      update(t) {
        if (title) title.reveal(t, 0.05);
        rows.forEach((r) => { const q = prog(t, r.at, 0.45, ctx.style.motion.enterEase); r.row.style.opacity = String(clamp01(q * 1.5)); r.row.style.transform = `translateX(${px((1 - q) * ctx.u * 6)})`; r.row.style.filter = q < 0.98 ? `blur(${px((1 - q) * 8)})` : 'none'; });
        if (pan) { const q = prog(t, 0.1, 0.7, ctx.style.motion.enterEase); pan.style.opacity = String(clamp01(q * 2)); pan.style.transform = `perspective(${px(ctx.style.panel.perspective)}) rotateY(${(1 - q) * -25 - 6}deg) rotateX(4deg) scale(${lerp(0.88, 1, q)})`; m.update(t); }
      },
    };
  },
};

export const notificationStack = {
  defaults: {},
  build(root, p, ctx, dur) {
    const w = ctx.W * (ctx.portrait ? 0.88 : 0.5);
    const titlePx = minFont(ctx, ctx.style.type.body);
    const bodyPx = Math.max(titlePx * 0.8, 40 * ctx.pxScale);
    const h = titlePx * 1.3 + (p.items.some((i) => i.body) ? bodyPx * 1.35 : 0) + ctx.u * 5;
    const gap = ctx.u * 2;
    const head = p.headline ? textBlock(ctx, root, p.headline, { size: 'title', maxWidth: ctx.W * 0.86, maxLines: 2 }) : null;
    const stackH = p.items.length * (h + gap);
    const top = ctx.H / 2 - stackH / 2 + (head ? ctx.u * 6 : 0);
    if (head) { head.node.style.left = px(ctx.W / 2 - head.width / 2); head.node.style.top = px(top - head.height - ctx.u * 6); }
    const every = (dur * 0.6) / p.items.length;
    const cards = p.items.map((it, i) => {
      const card = el('div', { position: 'absolute', left: px(ctx.W / 2 - w / 2), top: '0', width: px(w), height: px(h), borderRadius: px(ctx.u * 2.6), background: ctx.pal.panel, border: `1px solid ${ctx.pal.line}`, boxShadow: ctx.shadow(0.6), overflow: 'hidden' }, root);
      const icon = el('div', { position: 'absolute', left: px(ctx.u * 2.5), top: px(h / 2 - ctx.u * 4), width: px(ctx.u * 8), height: px(ctx.u * 8), borderRadius: px(ctx.u * 2), background: it.icon ? 'transparent' : ctx.accent, overflow: 'hidden' }, card);
      if (it.icon) { const img = el('img', { width: '100%', height: '100%', objectFit: 'cover' }, icon); img.src = ctx.asset(it.icon).url; }
      const tx = ctx.u * 13;
      const tt = label(ctx, card, it.title, { sizePx: titlePx, weight: 600, color: ctx.pal.panelInk || ctx.pal.ink });
      const bf = ctx.font('body');
      const fitPx = (text, size, room, weight) => Math.min(size, (room * size) / Math.max(1, measurer(bf.family, weight, 0)(text, size)));
      tt.style.fontSize = px(fitPx(it.title, titlePx, w - tx - ctx.u * 12, 600));
      Object.assign(tt.style, { left: px(tx), top: px(ctx.u * 2.4) });
      if (it.body) { const b = label(ctx, card, it.body, { sizePx: bodyPx, color: ctx.pal.panelMuted || ctx.pal.muted }); b.style.fontSize = px(fitPx(it.body, bodyPx, w - tx - ctx.u * 3, 400)); Object.assign(b.style, { left: px(tx), top: px(ctx.u * 2.4 + titlePx * 1.3) }); }
      if (it.meta) { const mt = label(ctx, card, it.meta, { sizePx: bodyPx * 0.85, color: ctx.pal.panelMuted || ctx.pal.muted }); Object.assign(mt.style, { right: px(ctx.u * 2.5), top: px(ctx.u * 2.6) }); }
      ctx.cue(0.2 + i * every, 'tick', -3);
      return { card, at: 0.2 + i * every };
    });
    return {
      update(t) {
        if (head) head.reveal(t, 0.05);
        const arrived = cards.filter((c) => t >= c.at).length;
        cards.forEach((c, i) => {
          const q = prog(t, c.at, 0.5, 'back');
          const slot = arrived - 1 - i;
          const y = top + Math.max(0, slot) * (h + gap);
          const prevY = top + Math.max(0, slot - 1) * (h + gap);
          const settle = slot >= 1 ? prog(t, cards[arrived - 1].at, 0.45, 'snap') : 1;
          c.card.style.transform = `translateY(${px(slot < 0 ? top - h : lerp(prevY, y, settle) - (1 - q) * h * 0.8)}) scale(${lerp(0.9, 1, q)})`;
          c.card.style.opacity = String(slot < 0 ? 0 : clamp01(q * 2));
          c.card.style.zIndex = String(100 - slot);
        });
      },
    };
  },
};

export const chartReveal = {
  defaults: {},
  build(root, p, ctx, dur) {
    const n = p.values.length;
    const areaW = ctx.W * (ctx.portrait ? 0.86 : 0.6), areaH = ctx.H * (ctx.portrait ? 0.4 : 0.48);
    const max = Math.max(...p.values) || 1;
    const gap = areaW * 0.04;
    const bw = (areaW - gap * (n - 1)) / n;
    const head = p.title ? textBlock(ctx, root, p.title, { size: 'title', maxWidth: ctx.W * 0.86, maxLines: 2 }) : null;
    const base = ctx.H / 2 + areaH / 2 + (head ? ctx.u * 4 : 0);
    if (head) { head.node.style.left = px(ctx.W / 2 - head.width / 2); head.node.style.top = px(base - areaH - head.height - ctx.u * 10); }
    const hi = p.highlight ?? p.values.indexOf(max);
    const valPx = Math.min(minFont(ctx, ctx.style.type.small), bw * 0.5);
    const bars = p.values.map((v, i) => {
      const x = ctx.W / 2 - areaW / 2 + i * (bw + gap);
      const bar = el('div', { position: 'absolute', left: px(x), width: px(bw), top: px(base), height: '0', borderRadius: `${px(bw * 0.18)} ${px(bw * 0.18)} ${px(4)} ${px(4)}`, background: i === hi ? `linear-gradient(180deg, ${mix(ctx.accent, '#ffffff', 0.25)}, ${ctx.accent})` : rgba(ctx.pal.ink, 0.12) }, root);
      const val = label(ctx, root, '', { sizePx: valPx, weight: 600, color: i === hi ? ctx.accent : ctx.pal.muted });
      Object.assign(val.style, { left: px(x), width: px(bw), textAlign: 'center' });
      const lab = p.labels?.[i] ? label(ctx, root, p.labels[i], { sizePx: valPx * 0.9, color: ctx.pal.muted }) : null;
      if (lab) Object.assign(lab.style, { left: px(x - gap / 2), width: px(bw + gap), textAlign: 'center', top: px(base + ctx.u * 1.5) });
      return { bar, val, v, h: (v / max) * areaH, at: 0.25 + i * 0.07 };
    });
    ctx.cue(0.25, 'whoosh', -4);
    return {
      update(t) {
        if (head) head.reveal(t, 0.05);
        bars.forEach((b) => {
          const q = prog(t, b.at, 0.8, ctx.style.motion.enterEase);
          b.bar.style.height = px(b.h * q); b.bar.style.top = px(base - b.h * q);
          b.val.textContent = `${Math.round(b.v * q)}${p.unit || ''}`;
          b.val.style.top = px(base - b.h * q - valPx * 1.4);
          b.val.style.opacity = String(clamp01(q * 2));
        });
      },
    };
  },
};
