// The page keynote-render.mjs draws every overlay frame on. Python (scripts/keynote/overlay.py)
// computes all animated values; this page only lays text out and applies them. Config text is set
// with textContent (never parsed as HTML), colours arrive pre-validated as #hex, and images are
// data: URIs only. Sizes follow docs/quality-bar.md (ids in comments).

const css = (c, font) => `
html, body { margin: 0; background: transparent; }
body { width: 1920px; height: 1080px; -webkit-font-smoothing: antialiased;
  font-family: 'DS Text', sans-serif; font-optical-sizing: auto; font-kerning: normal;
  text-rendering: geometricPrecision; }
#root { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }
#bg { position: absolute; inset: 0; display: none; }
.w { display: inline-block; white-space: pre; will-change: transform, filter; }
.ink { color: ${c.ink}; } .secondary { color: ${c.secondary}; } .accent { color: ${c.accent}; }
.role { color: ${c.role}; } .white { color: #FFFFFF; }
.line { position: absolute; left: 110px; width: 1700px; text-align: center; transform-origin: 50% 50%;
  text-wrap: balance; }
#title { font-family: 'DS Display', 'DS Text', sans-serif; font-weight: 500; line-height: 1.08; }
#sub { font-family: 'DS Display', 'DS Text', sans-serif; font-weight: 400; line-height: 1.2; }
#logo { position: absolute; left: ${960 - 64}px; top: 330px; width: 128px; height: auto; display: none; } /* X1 */
#pill { position: absolute; left: 960px; top: ${962 - 34}px; height: 68px; box-sizing: border-box; /* C1, C2 */
  display: none; align-items: center; gap: 14px; border-radius: 999px; background: rgba(255,255,255,0.95);
  box-shadow: 0 14px 40px rgba(60,45,60,0.12), 0 2px 6px rgba(60,45,60,0.06); white-space: nowrap;
  font-size: 30px; font-weight: 500; letter-spacing: -0.3px; transform-origin: 50% 50%; } /* C5 */
#pill.person { padding: 9px 30px 9px 9px; } /* C3 */
#pill.statement { padding: 16px 32px; } /* C4 */
#avatar { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; display: none; flex: none; }
#pilltext { line-height: 1; }
.box { position: absolute; box-sizing: border-box; border: 3px solid #E2483C; border-radius: 12px; /* H1-H3 */
  background: rgba(226,72,60,0.07); box-shadow: 0 0 0 6px rgba(226,72,60,0.10); transform-origin: 50% 50%; }
#outro { position: absolute; inset: 0; overflow: hidden; display: none; }
#sweep { position: absolute; left: -240px; width: 2400px; height: 2600px; transform: skewY(${c.skew}deg); } /* X2 */
#band { height: 320px; background: linear-gradient(100deg, ${c.sweep[0]}, ${c.sweep[1]}); }
#dark { height: 2280px; background: ${c.dark}; }
#lockup { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; display: flex;
  align-items: center; justify-content: center; gap: 30px; }
#mark { height: 100px; width: auto; display: none; }
#lockname { font-family: 'DS Display', 'DS Text', sans-serif; font-size: 72px; font-weight: 500;
  letter-spacing: -2px; line-height: 1; }
#static { position: absolute; left: 0; top: 0; display: none; }
#win { position: absolute; box-sizing: border-box; }
${font}`;

const html = (c, font) => `<!doctype html><html><head><meta charset="utf-8"><style>${css(c, font)}</style></head>
<body><div id="root">
<div id="bg"></div>
<div id="card"><img id="logo" alt=""><div id="title" class="line"></div><div id="sub" class="line"></div></div>
<div id="boxes"></div>
<div id="pill"><img id="avatar" alt=""><div id="pilltext"></div></div>
<div id="outro"><div id="sweep"><div id="band"></div><div id="dark"></div></div>
  <div id="lockup"><img id="mark" alt=""><div id="lockname"></div></div></div>
<div id="static"><div id="win"></div></div>
</div></body></html>`;

// Runs inside the page (page.evaluate). One call per frame; the DOM is rebuilt from `state`.
function render(state, images, styles) {
  const $ = (id) => document.getElementById(id);
  const show = (el, on, how = 'block') => { el.style.display = on ? how : 'none'; };
  const words = (el, list) => {
    el.replaceChildren();
    list.forEach(([text, role, opacity, blur, dx], i) => {
      if (i) el.append(document.createTextNode(' '));
      const span = document.createElement('span');
      span.className = `w ${role}`;
      span.textContent = text;
      span.style.opacity = opacity;
      span.style.filter = blur > 0 ? `blur(${blur}px)` : 'none';
      span.style.transform = dx ? `translateX(${dx}px)` : 'none';
      el.append(span);
    });
  };
  const image = (el, id) => {
    const src = images[id] || '';
    if (src && el.getAttribute('src') !== src) el.setAttribute('src', src);
    show(el, Boolean(src));
    return Boolean(src);
  };
  for (const id of ['bg', 'static']) show($(id), false);

  const bg = state.background;
  if (bg) {
    const layers = bg.fields.map(([color, radius, x, y]) =>
      `radial-gradient(circle ${radius}px at ${x}px ${y}px, ${color} 0px, transparent ${Math.round(radius * 0.68)}px)`);
    Object.assign($('bg').style, { display: 'block', backgroundColor: bg.base, backgroundImage: layers.join(', ') });
  }

  const card = state.card;
  show($('card'), Boolean(card));
  if (card) {
    const style = styles[card.kind];
    const title = $('title');
    Object.assign(title.style, { fontSize: `${style.size}px`, letterSpacing: `${style.tracking}px`,
      top: `${style.titleY}px`, transform: `translateY(-50%) translateY(${card.title.ty}px) scale(${card.title.scale})` });
    words(title, card.title.words);
    const sub = $('sub');
    show(sub, Boolean(card.sub));
    if (card.sub) {
      Object.assign(sub.style, { fontSize: `${style.subSize}px`, letterSpacing: `${style.subTracking}px`,
        top: `${style.subY}px`, transform: 'translateY(-50%)' });
      words(sub, card.sub.words);
    }
    if (card.logo && image($('logo'), 'logo')) {
      const [opacity, scale, blur] = card.logo;
      Object.assign($('logo').style, { opacity, transform: `scale(${scale})`, filter: blur ? `blur(${blur}px)` : 'none' });
    } else show($('logo'), false);
    const [opacity, ty, blur] = card.block;
    Object.assign($('card').style, { opacity, transform: `translateY(${ty}px)`, filter: blur ? `blur(${blur}px)` : 'none' });
  }

  $('boxes').replaceChildren(...(state.boxes || []).map(([x, y, w, h, opacity, scale]) => {
    const box = document.createElement('div');
    box.className = 'box';
    Object.assign(box.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, opacity,
      transform: `scale(${scale})` });
    return box;
  }));

  const pill = state.pill;
  show($('pill'), Boolean(pill), 'flex');
  if (pill) {
    $('pill').className = pill.variant;
    if (!(pill.variant === 'person' && image($('avatar'), pill.avatar))) show($('avatar'), false);
    words($('pilltext'), pill.words);
    Object.assign($('pill').style, { opacity: pill.opacity, filter: pill.blur ? `blur(${pill.blur}px)` : 'none',
      transform: `translateX(-50%) translateY(${pill.ty}px) scale(${pill.scale})` });
  }

  const outro = state.outro;
  show($('outro'), Boolean(outro));
  if (outro) {
    const center = 1330 - (1330 + 250) * outro.sweep; // band centre travels from below frame to above it
    $('sweep').style.top = `${center - 160}px`;
    words($('lockname'), outro.words);
    if (outro.mark && image($('mark'), images['logo-dark'] ? 'logo-dark' : 'logo')) {
      const [opacity, scale, dx] = outro.mark;
      Object.assign($('mark').style, { opacity, transform: `translateX(${dx}px) scale(${scale})` });
    } else show($('mark'), false);
  }

  const win = state.window;
  if (win) {
    show($('static'), true);
    Object.assign($('win').style, { left: `${win.x}px`, top: `${win.y}px`, width: `${win.w}px`, height: `${win.h}px`,
      borderRadius: `${win.radius}px`, background: win.fill, boxShadow: win.shadow || 'none' });
  }
}

export { html, render };
