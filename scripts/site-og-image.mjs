// Renders the site's social preview card (site/og-image.png, 1200x630) with headless Chrome, in the
// site's own fonts and colours, with a frame from a real finished sample video. Run it after changing the
// headline or the screenshot: node scripts/site-og-image.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, launchChrome, loadPlaywright } from './pw.mjs';

const uri = (file, type) => `data:${type};base64,${readFileSync(join(PLUGIN_ROOT, file)).toString('base64')}`;
const font = (file) => uri(file, 'font/woff2');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Bricolage Grotesque"; src: url(${font('site/fonts/bricolage-grotesque.woff2')}) format("woff2"); font-weight: 200 800; }
@font-face { font-family: "Schibsted Grotesk"; src: url(${font('site/fonts/schibsted-grotesk.woff2')}) format("woff2"); font-weight: 400 900; }
@font-face { font-family: "Geist Mono"; src: url(${font('assets/fonts/GeistMonoVariable.woff2')}) format("woff2"); font-weight: 100 900; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #fbfbfa; color: #141414;
  font-family: "Schibsted Grotesk", sans-serif; -webkit-font-smoothing: antialiased; }
.brand { position: absolute; left: 64px; top: 56px; display: flex; align-items: center; gap: 14px;
  font: 600 26px/1 "Geist Mono", monospace; letter-spacing: -0.5px; }
.brand img { width: 40px; height: 40px; }
h1 { position: absolute; left: 64px; top: 150px; width: 560px; margin: 0; font: 650 60px/1.02 "Bricolage Grotesque", sans-serif;
  letter-spacing: -2px; text-wrap: balance; }
h1 em { font-style: normal; color: #d2430e; }
.sub { position: absolute; left: 64px; top: 430px; width: 520px; margin: 0; font-size: 23px; line-height: 1.4; color: #5e5e5b; }
.tags { position: absolute; left: 64px; bottom: 52px; display: flex; gap: 10px; font: 500 17px/1 "Geist Mono", monospace; }
.tags span { padding: 9px 14px; border-radius: 999px; background: #f1f1ee; color: #3a3a38; }
.shot { position: absolute; left: 650px; top: 120px; width: 700px; border-radius: 14px; overflow: hidden;
  box-shadow: 0 30px 80px rgba(40, 30, 20, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.06); }
.shot img { display: block; width: 100%; }
.bar { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: #d2430e; }
</style></head><body>
<div class="brand"><img src="${uri('assets/logo/mark.svg', 'image/svg+xml')}" alt="">demo-studio</div>
<h1>A finished demo video of your <em>real</em> app.</h1>
<p class="sub">Your coding agent plans it, records it, cuts and narrates it. Free, local, open source.</p>
<div class="tags"><span>Claude Code</span><span>Codex</span><span>Cursor</span><span>Gemini CLI</span></div>
<div class="shot"><img src="${uri('docs/img/sample-showcase-poster.jpg', 'image/jpeg')}" alt=""></div>
<div class="bar"></div>
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
