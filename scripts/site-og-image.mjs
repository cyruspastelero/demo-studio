// Renders the site's social preview card (site/og-image.png, 1200x630) with headless Chrome, in the
// site's own fonts and colours, with a frame from a real finished sample video. Run it after changing the
// headline or the screenshot: node scripts/site-og-image.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, launchChrome, loadPlaywright } from './pw.mjs';

const uri = (file, type) => `data:${type};base64,${readFileSync(join(PLUGIN_ROOT, file)).toString('base64')}`;
const font = (file) => uri(file, 'font/woff2');

const icons = {
  record: '<rect x="1.75" y="3.25" width="12.5" height="9.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6.75 6.2v3.6L9.9 8z" fill="currentColor"/>',
  plan: '<path d="M2.5 4.5h11M2.5 8h7M2.5 11.5h9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  cut: '<path d="M2.5 9.5v-3M5.5 12V4M8.5 10V6M11.5 13V3M14 9V7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  local: '<rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
};
const point = (icon, text) => `<li><svg viewBox="0 0 16 16">${icons[icon]}</svg>${text}</li>`;

// Mirrors the site's hero: the left rail (headline, four points), the rule, then the showcase frame with
// its Play pill, the status pill above it, all on the page's graphite-to-ember background.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "DM Sans"; src: url(${font('site/fonts/dm-sans.woff2')}) format("woff2"); font-weight: 100 1000; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; color: #ededed; font-family: "DM Sans", sans-serif;
  -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(55% 75% at 12% 118%, rgba(255, 122, 46, 0.45), transparent 70%),
    radial-gradient(70% 60% at 80% 120%, rgba(150, 120, 100, 0.30), transparent 70%),
    linear-gradient(180deg, #0c0c0c 0%, #181818 45%, #3a3431 100%); }
.rail { position: absolute; left: 0; top: 0; bottom: 0; width: 420px; }
.rule { position: absolute; left: 420px; top: 0; bottom: 0; width: 1px; background: rgba(255, 255, 255, 0.14); }
.brand { position: absolute; left: 52px; top: 46px; display: flex; align-items: center; gap: 12px; font: 500 22px/1 "DM Sans", sans-serif; color: #fff; }
.brand img { width: 36px; height: 36px; }
h1 { position: absolute; left: 52px; top: 116px; width: 350px; margin: 0; color: #fff; font: 500 46px/1.04 "DM Sans", sans-serif; letter-spacing: -1.4px; }
ul { position: absolute; left: 52px; top: 340px; margin: 0; padding: 0; list-style: none; display: grid; gap: 14px; font-size: 17px; }
li { display: flex; align-items: center; gap: 12px; }
li svg { width: 19px; height: 19px; opacity: 0.85; }
.install { position: absolute; left: 52px; bottom: 50px; padding: 12px 22px; border-radius: 999px; background: #fff; color: #111; font: 500 18px/1 "DM Sans", sans-serif; }
.status { position: absolute; left: 470px; top: 40px; display: inline-flex; align-items: center; gap: 10px; padding: 8px 16px; border-radius: 999px;
  font-size: 16px; letter-spacing: 0.02em; background: rgba(0, 0, 0, 0.35); box-shadow: rgba(255, 255, 255, 0.12) 0 0 0 1px inset; }
.status::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #ff7a2e; }
.status span { color: #9a9a9a; }
.shot { position: absolute; left: 470px; top: 110px; width: 680px; aspect-ratio: 16 / 9; border-radius: 26px; overflow: hidden;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45), rgba(255, 255, 255, 0.12) 0 0 0 1px; }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
.play { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 12px;
  padding: 13px 22px; border-radius: 999px; background: #fff; color: #111; font: 500 19px/1 "DM Sans", sans-serif; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25); }
.play svg { width: 15px; height: 15px; }
.play span { color: #777; font-variant-numeric: tabular-nums; }
.caption { position: absolute; left: 470px; top: 512px; width: 680px; display: flex; justify-content: space-between; font-size: 15px; color: #9a9a9a; }
</style></head><body>
<div class="rail">
  <div class="brand"><img src="${uri('assets/logo/mark.svg', 'image/svg+xml')}" alt="">demo-studio</div>
  <h1>Demo videos of your real app, made by your coding agent.</h1>
  <ul>${point('record', 'Records your product in a real browser')}${point('plan', 'Shows you the plan before it films')}${point('cut', 'Cuts, narrates and mixes it for you')}${point('local', 'Runs on your machine, no account')}</ul>
  <div class="install">Install it</div>
</div>
<div class="rule"></div>
<div class="status">Free and open source <span>MIT licensed, on GitHub</span></div>
<div class="shot"><img src="${uri('docs/img/sample-showcase-poster.jpg', 'image/jpeg')}" alt="">
  <div class="play"><svg viewBox="0 0 16 16"><path d="M3 1.8v12.4L14 8z" fill="currentColor"/></svg>Play <span>1:27</span></div></div>
<div class="caption"><span>Study app showcase, with sound</span><span>Recorded and finished by the plugin</span></div>
</body></html>`;

const { chromium } = await loadPlaywright();
const browser = await launchChrome(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const out = join(PLUGIN_ROOT, 'site', 'og-image.png');
  await page.screenshot({ path: out });
  console.log(`OUTPUT ${out}`);
} finally {
  await browser.close();
}
