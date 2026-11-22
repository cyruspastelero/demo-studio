// Text-led scenes: kineticText, cardScatter, logoLockup, sparkle.
import { el, px, prog, lerp, clamp01, textBlock, revealWords, media, rng, star, rgba, ease, measurer } from '../kit.js';

/** Normalise phrases to [{text, t}] with t in seconds; unspecified times spread over the scene. */
export function phraseTimes(ctx, phrases, dur, { lead = 0.1, span = 0.7 } = {}) {
  const list = phrases.map((p) => (typeof p === 'string' ? { text: p } : p));
  return list.map((p, i) => ({ text: p.text, t: p.at != null ? ctx.sec(p.at) : dur * (lead + (span * i) / list.length) }));
}

function textBox(ctx) {
  return { w: ctx.W * (ctx.portrait ? 0.86 : 0.74), h: ctx.H * (ctx.portrait ? 0.42 : 0.5) };
}

function place(block, cx, cy) {
  block.node.style.left = px(cx - block.width / 2);
  block.node.style.top = px(cy - block.height / 2);
}

export const kineticText = {
  defaults: { mode: 'replace', size: 'hero', reveal: 'style' },
  build(root, p, ctx, dur) {
    const box = textBox(ctx);
    const items = phraseTimes(ctx, p.phrases, dur);
    const markSize = ctx.u * 17;
    const markT = p.mark ? (p.markAt != null ? ctx.sec(p.markAt) : items[items.length - 1].t + 0.45) : null;
    let blocks;
    if (p.mode === 'build') {
      const block = textBlock(ctx, root, items.map((i) => i.text).join(' '), { size: p.size, maxWidth: box.w, maxHeight: box.h, groups: items.map((i) => i.text.split(/\s+/).filter(Boolean).length) });
      let k = 0;
      const groups = items.map((it) => { const n = it.text.split(/\s+/).filter(Boolean).length; const g = block.words.slice(k, k + n); k += n; return { t: it.t, words: g }; });
      blocks = [{ block, groups }];
      var starts = groups.flatMap((g) => g.words.map((_, i) => g.t + (i * ctx.style.text.staggerMs) / 1000));
    } else {
      blocks = items.map((it) => ({ block: textBlock(ctx, root, it.text, { size: p.size, maxWidth: box.w, maxHeight: box.h }), t: it.t }));
    }
    items.forEach((it) => ctx.cue(it.t, 'swish', -6));
    let mark = null;
    if (p.mark) {
      mark = el('img', { position: 'absolute', width: px(markSize), height: px(markSize), left: px(ctx.W / 2 - markSize / 2), opacity: '0' }, root);
      mark.src = ctx.asset(p.mark).url;
      ctx.cue(markT, 'pop');
    }
    return {
      update(t) {
        const shift = mark ? prog(t, markT - 0.1, 0.45, 'snap') : 0;
        const cy = ctx.H / 2 + shift * markSize * 0.62;
        if (p.mode === 'build') {
          const { block, groups } = blocks[0];
          place(block, ctx.W / 2, cy);
          revealWords(ctx, block.words, t, starts, p.reveal, block.size);
        } else {
          blocks.forEach((b, i) => {
            const next = blocks[i + 1];
            const visible = t >= b.t - 0.05 && (!next || t < next.t + 0.2);
            b.block.node.style.display = visible ? 'block' : 'none';
            if (!visible) return;
            place(b.block, ctx.W / 2, cy);
            b.block.reveal(t, b.t, p.reveal, next ? next.t - b.t - 0.15 : Infinity);
            if (next) b.block.hide(t, next.t - 0.12, 0.22);
          });
        }
        if (mark) {
          const pm = prog(t, markT, (ctx.style.motion.popMs ?? 500) / 1000, ctx.style.motion.popEase || 'back');
          const last = blocks[blocks.length - 1].block;
          mark.style.top = px(cy - last.height / 2 - markSize * 1.25);
          mark.style.opacity = String(clamp01(pm * 3));
          mark.style.transform = `scale(${pm}) rotate(${(1 - pm) * -25}deg)`;
        }
      },
    };
  },
};

const SCATTER_LAND = [[0.1, 0.2, -14], [0.9, 0.18, 12], [0.08, 0.8, 10], [0.92, 0.82, -11], [0.5, 0.06, 3], [0.5, 0.95, -4], [0.3, 0.5, -6], [0.7, 0.5, 6], [0.5, 0.5, 0]];
const SCATTER_PORT = [[0.26, 0.15, -10], [0.76, 0.2, 9], [0.22, 0.84, 8], [0.78, 0.8, -8], [0.5, 0.06, 3], [0.5, 0.95, -3], [0.15, 0.5, -6], [0.85, 0.5, 6], [0.5, 0.5, 0]];

export const cardScatter = {
  defaults: { layout: 'scatter' },
  build(root, p, ctx, dur) {
    const r = rng(11 + p.images.length);
    const n = p.images.length;
    const cardW = ctx.W * (ctx.portrait ? 0.5 : ctx.wide ? 0.3 : 0.42);
    const slots = ctx.portrait ? SCATTER_PORT : SCATTER_LAND;
    const cards = p.images.map((spec, i) => {
      const m0 = ctx.asset(spec);
      const w = cardW * (0.9 + r() * 0.2);
      const h = w / (m0.width / m0.height);
      const wrap = el('div', { position: 'absolute', left: '0', top: '0', width: px(w), height: px(h), perspective: px(ctx.style.panel.perspective) }, root);
      const border = ctx.style.panel.border ? ctx.style.panel.border.replace('LINE', ctx.pal.line).replace('ACCENT', rgba(ctx.accent, 0.55)) : `1px solid ${ctx.pal.line}`;
      const card = el('div', { position: 'absolute', inset: '0', borderRadius: px(ctx.style.panel.radius * w), overflow: 'hidden', background: ctx.pal.panel, boxShadow: ctx.shadow(0.7), border }, wrap);
      const m = media(ctx, card, spec);
      let x, y, rot;
      if (p.layout === 'row') { x = ctx.W / 2 + (i - (n - 1) / 2) * w * 1.08; y = ctx.H * 0.5; rot = 0; }
      else if (p.layout === 'grid') { const cols = ctx.portrait ? 2 : 3; const rows = Math.ceil(n / cols); x = ctx.W / 2 + ((i % cols) - (cols - 1) / 2) * w * 1.08; y = ctx.H / 2 + (Math.floor(i / cols) - (rows - 1) / 2) * h * 1.12; rot = 0; }
      else if (p.layout === 'orbit') { const a = (i / n) * Math.PI * 2; x = ctx.W / 2 + Math.cos(a) * ctx.W * 0.32; y = ctx.H / 2 + Math.sin(a) * ctx.H * 0.3; rot = (r() - 0.5) * 16; }
      else { const s = slots[i % slots.length]; x = ctx.W * s[0]; y = ctx.H * s[1]; rot = s[2]; }
      return { wrap, card, m, w, h, x, y, rot, delay: i * Math.min(0.09, (dur * 0.3) / n), spin: (r() - 0.5) * 50 };
    });
    ctx.cue(0.02, 'whoosh');
    const head = p.phrases ? phraseTimes(ctx, p.phrases, dur, { lead: 0.12, span: 0.6 }) : null;
    const box = { w: ctx.W * (ctx.portrait ? 0.84 : 0.5), h: ctx.H * 0.3 };
    const block = head ? textBlock(ctx, root, head.map((h) => h.text).join(' '), { size: 'title', maxWidth: box.w, maxHeight: box.h, groups: head.map((h) => h.text.split(/\s+/).filter(Boolean).length) }) : null;
    let groups = [];
    let headStarts = [];
    if (block) {
      block.node.style.zIndex = '20';
      let k = 0;
      groups = head.map((h) => { const c = h.text.split(/\s+/).filter(Boolean).length; const g = block.words.slice(k, k + c); k += c; return { t: h.t, words: g }; });
      headStarts = groups.flatMap((g) => g.words.map((_, i) => g.t + (i * ctx.style.text.staggerMs) / 1000));
      const plate = el('div', { position: 'absolute', left: px(ctx.W / 2 - box.w * 0.62), top: px(ctx.H / 2 - block.height * 1.1), width: px(box.w * 1.24), height: px(block.height * 2.2), background: `radial-gradient(closest-side, ${ctx.pal.bg} 40%, ${rgba(ctx.pal.bg, 0)} 100%)`, zIndex: '15' }, root);
      plate.style.pointerEvents = 'none';
    }
    return {
      update(t) {
        cards.forEach((c) => {
          const pe = prog(t, c.delay, 0.75, ctx.style.motion.enterEase);
          const drift = t / Math.max(1, dur);
          const orbitA = p.layout === 'orbit' ? drift * 0.5 : 0;
          const dx = p.layout === 'orbit' ? Math.cos(orbitA) : 1;
          const x = lerp(ctx.W / 2, c.x, pe) + (p.layout === 'row' ? -drift * ctx.W * 0.06 : (c.x - ctx.W / 2) * drift * 0.06 * dx);
          const y = lerp(ctx.H / 2 + ctx.H * 0.15, c.y, pe) + (c.y - ctx.H / 2) * drift * 0.06;
          const rx = (1 - pe) * 60 + 8 * Math.sin(drift * 2 + c.spin), ry = (1 - pe) * c.spin + 10 * Math.cos(drift * 2);
          c.wrap.style.transform = `translate(${px(x - c.w / 2)}, ${px(y - c.h / 2)}) scale(${lerp(0.4, 1, pe)})`;
          c.card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${c.rot + (1 - pe) * c.spin}deg)`;
          c.card.style.opacity = String(clamp01(pe * 2.5));
          c.card.style.filter = pe < 0.98 ? `blur(${px((1 - pe) * 14)})` : 'none';
          c.m.update(t);
        });
        if (block) { place(block, ctx.W / 2, ctx.H / 2); revealWords(ctx, block.words, t, headStarts, 'style', block.size); }
      },
    };
  },
};

export const logoLockup = {
  defaults: {},
  build(root, p, ctx, dur) {
    const logoSrc = p.logo || ctx.brand.logo;
    const name = p.name || ctx.brand.name;
    const url = p.url ?? ctx.brand.url;
    const markSize = ctx.u * (ctx.portrait ? 16 : 14);
    const group = el('div', { position: 'absolute', left: '0', top: '0', width: px(ctx.W), height: px(ctx.H) }, root);
    const mark = logoSrc ? el('img', { position: 'absolute', width: px(markSize), height: px(markSize) }, group) : null;
    if (mark) mark.src = ctx.asset(logoSrc).url;
    const nameBlock = textBlock(ctx, group, name, { size: 'hero', maxWidth: ctx.W * (ctx.portrait ? 0.84 : 0.6), maxLines: 1, align: ctx.portrait ? 'center' : 'left' });
    const nf = ctx.font('display');
    const nameW = Math.min(nameBlock.width, measurer(nf.family, nf.weight, ctx.style.type.tracking ?? -0.01)(name, nameBlock.size));
    const gap = markSize * 0.35;
    let markX, markY, nameX, nameY;
    if (ctx.portrait) { markX = ctx.W / 2 - markSize / 2; markY = ctx.H * 0.42 - markSize; nameX = ctx.W / 2 - nameBlock.width / 2; nameY = ctx.H * 0.42 + gap; }
    else { const total = markSize + gap + nameW; markX = ctx.W / 2 - total / 2; markY = ctx.H * 0.44 - markSize / 2; nameX = markX + markSize + gap; nameY = ctx.H * 0.44 - nameBlock.height / 2; }
    nameBlock.node.style.left = px(nameX); nameBlock.node.style.top = px(nameY);
    const urlNode = url ? el('div', { position: 'absolute', left: '0', width: px(ctx.W), textAlign: 'center', top: px(ctx.portrait ? nameY + nameBlock.height + ctx.u * 7 : ctx.H * 0.44 + markSize * 0.95), fontFamily: `"${ctx.font('body').family}"`, fontWeight: '500', fontSize: px(Math.max(ctx.style.type.small * ctx.u, 44 * ctx.pxScale)), color: ctx.pal.muted }, group) : null;
    if (urlNode) {
      const pill = el('span', { display: 'inline-block', padding: `${px(ctx.u * 1.1)} ${px(ctx.u * 2.6)}`, borderRadius: px(ctx.u * 6), background: ctx.tone === 'dark' ? rgba('#ffffff', 0.08) : rgba(ctx.pal.ink, 0.05), border: `1px solid ${ctx.pal.line}` }, urlNode);
      pill.textContent = url;
    }
    const tagline = p.tagline ? textBlock(ctx, group, p.tagline, { size: 'body', font: 'body', maxWidth: ctx.W * 0.8, maxLines: 2, color: ctx.pal.muted }) : null;
    if (tagline) { tagline.node.style.left = px(ctx.W / 2 - tagline.width / 2); tagline.node.style.top = px(ctx.H * 0.72); }
    ctx.cue(0.05, 'hit');
    return {
      update(t) {
        const pm = prog(t, 0.05, (ctx.style.motion.popMs ?? 550) / 1000, ctx.style.motion.popEase || 'back');
        if (mark) {
          const slide = ctx.portrait ? 0 : (1 - prog(t, 0.35, 0.5, 'snap')) * (nameW + gap) / 2;
          mark.style.left = px(markX + slide); mark.style.top = px(markY);
          mark.style.opacity = String(clamp01(pm * 3));
          mark.style.transform = `scale(${pm}) rotate(${(1 - pm) * -30}deg)`;
        }
        nameBlock.reveal(t, 0.45, 'blur');
        if (urlNode) { const pu = prog(t, 0.9, 0.5, 'out'); urlNode.style.opacity = String(pu); urlNode.style.transform = `translateY(${px((1 - pu) * ctx.u * 3)})`; }
        if (tagline) tagline.reveal(t, 1.1);
      },
    };
  },
};

export const sparkle = {
  defaults: { count: 3 },
  build(root, p, ctx, dur) {
    const big = Math.max(ctx.W, ctx.H) * 0.9;
    const main = star(ctx, root, big);
    const r = rng(5);
    const minis = Array.from({ length: p.count }, () => ({ node: star(ctx, root, ctx.u * (3 + r() * 3)), a: r() * Math.PI * 2, d: 0.25 + r() * 0.3 }));
    ctx.cue(0, 'sparkle');
    return {
      update(t) {
        const k = clamp01(t / dur);
        const grow = ease('out')(clamp01(k / 0.35));
        const shrink = ease('inOut')(clamp01((k - 0.3) / 0.7));
        const s = lerp(0.02, 1, grow) * lerp(1, 0.05, shrink);
        const x = ctx.W / 2 + shrink * ctx.W * 0.28, y = ctx.H / 2 - shrink * ctx.H * 0.3;
        main.style.transform = `translate(${px(x - big / 2)}, ${px(y - big / 2)}) scale(${s}) rotate(${k * 120}deg)`;
        main.style.opacity = String(1 - clamp01((k - 0.85) / 0.15));
        minis.forEach((m) => {
          const pm = clamp01((k - 0.35) / 0.6);
          const dist = ease('out')(pm) * Math.min(ctx.W, ctx.H) * m.d;
          m.node.style.transform = `translate(${px(ctx.W / 2 + Math.cos(m.a) * dist)}, ${px(ctx.H / 2 + Math.sin(m.a) * dist)}) scale(${Math.sin(Math.PI * pm)}) rotate(${pm * 180}deg)`;
        });
      },
    };
  },
};
