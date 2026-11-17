// Shared helpers, inlined into every scene by mk-scene.sh after scenes/_project.js
// (which defines `const PROJECT = { ... }`). Runs inside Playwright MCP's run_code
// sandbox: no require/import, helpers do not persist between calls, and every async
// callback must catch its own errors.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = 1440, H = 810;            // CSS viewport; captured at DPR 2 = 2880x1620
const RX = `http://127.0.0.1:${PROJECT.port || 8765}`;
// The receiver only accepts requests that carry its per-run token. mk-scene.sh, mk-lib.sh and rec.mjs
// put RX_TOKENS (port -> token, from recordings/.rx-token) in front of this file.
const RX_TOKEN = (typeof RX_TOKENS === 'object' && RX_TOKENS && RX_TOKENS[String(PROJECT.port || 8765)]) || PROJECT.rxToken || '';
const RX_HEADERS = { 'x-rx-token': RX_TOKEN };
function rxPost(path, body) {
  if (!RX_TOKEN) throw new Error('no frame receiver token: start frame-receiver.mjs first, then re-run mk-scene.sh (or mk-lib.sh and its _lib.run.js)');
  return api.post(`${RX}${path}`, body === undefined ? { headers: RX_HEADERS }
    : { data: JSON.stringify(body), headers: { ...RX_HEADERS, 'content-type': 'application/json' } });
}
const ctx = page.context().browser().contexts().find(c => c !== page.context());
if (!ctx) throw new Error('2x recording context missing; run setup-context first');
const api = ctx.request;

const findTab = part => ctx.pages().find(p => p.url().includes(part));
async function openTab(url) { const p = await ctx.newPage(); await p.setViewportSize({ width: W, height: H }); await p.goto(url); return p; }
async function tabFor(part, url) { return findTab(part) || openTab(url || `https://${part}`); }

// Throws when the page drifted to another URL (redirects, wrong channel, logout).
function ensure(p, part) { if (!p.url().includes(part)) throw new Error(`expected ${part}, on ${p.url()}`); }

async function prep(p) {
  await p.bringToFront();
  await p.setViewportSize({ width: W, height: H });  // tab switches can reset the viewport
  await sleep(600);
  await p.evaluate(CURSOR_FN, CURSOR_STYLE).catch(() => {});
  await p.evaluate(MASK_FN, MASK_CFG).catch(() => {});
  if (PROJECT.clutter) await hideClutter(p, PROJECT.clutter);
}

// Hides banners/popups whose text matches any of the given regex sources; stays active.
// An empty list hides nothing: joined into a pattern it would match every element on the page.
async function hideClutter(p, sources) {
  const patterns = (sources || []).filter(source => typeof source === 'string' && source.trim());
  if (!patterns.length) return;
  await p.evaluate(src => {
    const re = new RegExp(src.join('|'));
    const hide = () => {
      for (const el of document.querySelectorAll('div, section, aside, button, [role=button], [role=dialog]')) {
        if (el.dataset.demoHidden || el.children.length > 12) continue;
        const r = el.getBoundingClientRect();
        if (r.height < 12 || r.height > 160) continue;
        if (re.test((el.innerText || '').trim())) { el.dataset.demoHidden = '1'; el.style.setProperty('display', 'none', 'important'); }
      }
    };
    hide();
    if (!window.__demoClutter) { window.__demoClutter = new MutationObserver(hide); window.__demoClutter.observe(document.body, { childList: true, subtree: true }); }
  }, patterns);
}

// Starts a screencast take; returns stop() which flushes frames and returns the receiver summary.
async function record(p, take) {
  const [w, h, dpr] = await p.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
  if (w !== W || h !== H || dpr !== 2) throw new Error(`bad viewport ${w}x${h}@${dpr}; call prep(p) first`);
  const started = await rxPost(`/start?take=${encodeURIComponent(take)}`);
  if (!started.ok()) throw new Error(`frame receiver refused start: ${await started.text()}`);
  const cdp = await ctx.newCDPSession(p);
  let chain = Promise.resolve();
  cdp.on('Page.screencastFrame', f => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    chain = chain.then(() => rxPost('/frame', { ts: f.metadata.timestamp, b64: f.data })).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W * 2, maxHeight: H * 2 });
  let stopped = false;
  return async () => {
    if (stopped) return null; stopped = true;
    await sleep(300);
    await cdp.send('Page.stopScreencast').catch(() => {});
    await chain; await cdp.detach().catch(() => {});
    return (await rxPost('/stop')).json();
  };
}

// Post-encode blur box for secrets the in-page mask cannot catch (canvas, images).
// Pass `since` = now() taken BEFORE the click that reveals the secret.
const now = () => Date.now() / 1000 - 0.2;
async function blur(loc, since, until) {
  const b = await loc.boundingBox();
  if (!b) throw new Error('blur target not visible');
  const res = await rxPost('/blur', { x: b.x, y: b.y, w: b.width, h: b.height, t: since || now(), ...(until ? { until } : {}) });
  if (!res.ok()) throw new Error(`frame receiver refused blur box: ${await res.text()}`);
}
async function blurRect(x, y, w, h, since) {
  const res = await rxPost('/blur', { x, y, w, h, t: since || now() });
  if (!res.ok()) throw new Error(`frame receiver refused blur box: ${await res.text()}`);
}

// Human-looking pointer: eased (slow-fast-slow) along a gentle arc, never a straight constant-speed line.
// The last position lives on ctx because nothing else survives between run_code calls.
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
async function moveHuman(p, x, y, steps = 30) {
  const from = ctx._mouse || { x: W * 0.62, y: H * 0.4 };
  const dist = Math.hypot(x - from.x, y - from.y);
  const n = Math.max(8, Math.round(steps * Math.min(1.4, 0.6 + dist / 900)));
  const bend = Math.min(60, dist * 0.08) * (Math.random() < 0.5 ? -1 : 1);
  const nx = -(y - from.y) / (dist || 1), ny = (x - from.x) / (dist || 1);
  for (let i = 1; i <= n; i++) {
    const t = easeInOut(i / n), arc = Math.sin(Math.PI * t) * bend;
    await p.mouse.move(from.x + (x - from.x) * t + nx * arc, from.y + (y - from.y) * t + ny * arc);
    await sleep(14);
  }
  ctx._mouse = { x, y };
}
async function glide(p, loc, dx = 0.5, dy = 0.5, steps = 30) {
  const b = await loc.boundingBox();
  if (!b) throw new Error('glide target not visible');
  await moveHuman(p, b.x + b.width * dx, b.y + b.height * dy, steps);
  return b;
}
async function tap(p) { await p.mouse.down(); await sleep(70); await p.mouse.up(); }
async function click(p, loc, dx, dy) { await glide(p, loc, dx, dy); await sleep(350); await tap(p); }
async function typeHuman(p, text, delay = 55) { await p.keyboard.type(text, { delay }); }
async function smoothScroll(p, dy, steps = 25) { for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy / steps); await sleep(16); } }
async function scrollIntoCenter(p, loc) {
  const top = await loc.evaluate(el => el.getBoundingClientRect().top + scrollY - innerHeight * 0.3);
  await p.evaluate(t => window.scrollTo({ top: t, behavior: 'smooth' }), top);
  await sleep(1200);
}
// Moves the pointer off the content so it does not cover what the viewer should read.
async function park(p, x = W * 0.62, y = H * 0.4) { await moveHuman(p, x, y, 25); }
// Puts the pointer at a resting spot before record() starts (an instant jump, off camera).
async function placeCursor(p, x = W * 0.62, y = H * 0.4) { await p.mouse.move(x, y); ctx._mouse = { x, y }; }

// Visible cursor (headless screencasts have no OS cursor). PROJECT.cursor:
//   'arrow' (default) the normal macOS arrow, tip is the hotspot, a slight press on click
//   'hand'  a pointing hand whose fingertip is the hotspot (for app/marketing demos)
//   'dot'   the old blue click dot; avoid, it reads as a screen recorder, not a person
const CURSOR_STYLE = PROJECT.cursor || 'arrow';
const CURSOR_FN = style => {
  if (document.getElementById('demo-cursor')) return;
  const c = document.createElement('div'); c.id = 'demo-cursor';
  const base = { position: 'fixed', left: '-60px', top: '-60px', zIndex: 2147483647, pointerEvents: 'none', transition: 'transform 120ms ease' };
  let down = 'scale(1.8)';
  if (style === 'hand') {
    c.innerHTML = '<svg width="34" height="39" viewBox="0 0 24 28" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 13V3a1.5 1.5 0 0 1 3 0v8.5v-1a1.5 1.5 0 0 1 3 0V12v-.5a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0V19c0 3-2 6-5 6h-4.5c-2 0-3-1-4-2.5L3.8 17.8a1.4 1.4 0 0 1 2-2L8.5 18Z" fill="#fff" stroke="#111" stroke-width="1.1" stroke-linejoin="round"/><path d="M11.5 15.5v4M14.5 15.5v4M17.5 15.5v4" stroke="#111" stroke-width="0.9" stroke-linecap="round"/></svg>';
    Object.assign(c.style, base, { width: '34px', height: '39px', marginLeft: '-14.2px', marginTop: '-2.2px', transformOrigin: '14.2px 2.2px', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))' });
    down = 'scale(0.86)';
  } else if (style === 'arrow') {
    // macOS arrow proportions; the tip sits 1.5 units (1.8px) inside the box and is the hotspot.
    c.innerHTML = '<svg width="19" height="27" viewBox="0 0 16 23" xmlns="http://www.w3.org/2000/svg"><path transform="translate(1.5 1.5)" d="M0 0V16.5L4 12.7L6.6 18.9L9.2 17.8L6.6 11.7H12Z" fill="#000" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, base, { width: '19px', height: '27px', marginLeft: '-1.8px', marginTop: '-1.8px', transformOrigin: '1.8px 1.8px', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.3))' });
    down = 'scale(0.92)';
  } else {
    Object.assign(c.style, base, { width: '20px', height: '20px', marginLeft: '-10px', marginTop: '-10px', borderRadius: '50%', background: 'rgba(28,110,246,0.55)', border: '2px solid white', boxShadow: '0 0 0 1px rgba(0,0,0,0.35)' });
  }
  document.body.appendChild(c);
  document.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  document.addEventListener('mousedown', () => { c.style.transform = down; }, true);
  document.addEventListener('mouseup', () => { c.style.transform = 'scale(1)'; }, true);
};

// Blurs secrets inside the page itself, so the blur follows scrolling and animation.
// Re-scans on every DOM change. Extend via PROJECT.maskPatterns / PROJECT.maskLabels.
const MASK_CFG = {
  tokens: [
    '(xapp|xoxb|xoxp|xoxe)-[\\w-]{10,}', '\\bsk-[\\w-]{20,}', '\\bsk_(live|test)_\\w{10,}', '\\bvck_\\w{20,}',
    '\\bgh[pousr]_\\w{20,}', '\\beyJ[\\w-]{10,}\\.[\\w-]{10,}\\.[\\w-]{10,}', '\\b[0-9a-f]{64,}\\b', '\\bAKIA[0-9A-Z]{16}\\b',
    ...(PROJECT.maskPatterns || []),
  ],
  labels: ['Verification Token', 'Signing Secret', 'Client Secret', 'Bot User OAuth Token', 'API key', 'Client ID', 'Secret key', 'Access token', ...(PROJECT.maskLabels || [])],
};
const MASK_FN = cfg => {
  if (window.__maskObs) return;
  const TOKEN = new RegExp(cfg.tokens.join('|'));
  const LABELS = new RegExp(`^(${cfg.labels.join('|')})$`, 'i');
  const mark = el => { if (el && el.style && !el.dataset.masked) { el.dataset.masked = '1'; el.style.setProperty('filter', 'blur(7px)', 'important'); } };
  const scan = () => {
    for (const el of document.querySelectorAll('input, textarea')) if (TOKEN.test(el.value || '')) mark(el);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      if (TOKEN.test(t)) mark(n.parentElement);
      if (LABELS.test(t)) {
        const box = n.parentElement.closest('div, section, label, dt, th') || n.parentElement;
        for (const v of box.parentElement ? box.parentElement.querySelectorAll('input, code, pre, span') : []) {
          const val = (v.value || (v.children.length === 0 ? v.textContent : '') || '').trim();
          if (val && val !== t && val.length >= 16 && !/\s/.test(val) && !/^[•*]+$/.test(val)) mark(v);
        }
      }
    }
  };
  scan();
  window.__maskObs = new MutationObserver(scan);
  window.__maskObs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value'] });
};
async function maskSecrets(p) { await p.evaluate(MASK_FN, MASK_CFG); }
// Lists what the mask caught (first 6 chars only) so a scene can assert before recording.
async function maskedSummary(p) { return p.evaluate(() => [...document.querySelectorAll('[data-masked]')].map(e => (e.value || e.textContent || '').slice(0, 6))); }

// Cursor + masking on every page load in the recording context (installed once per context).
if (!ctx._demoInit) {
  ctx._demoInit = true;
  await ctx.addInitScript({ content: `window.addEventListener('DOMContentLoaded', () => { try { (${CURSOR_FN.toString()})(${JSON.stringify(CURSOR_STYLE)}); (${MASK_FN.toString()})(${JSON.stringify(MASK_CFG)}); } catch (e) {} });` });
}
