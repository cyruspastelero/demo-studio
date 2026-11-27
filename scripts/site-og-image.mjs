// Renders the site's social preview card (site/og-image.png, 1200x630) with headless Chrome, in the
// site's own fonts and colours, with a frame from a real finished sample video. Run it after changing the
// headline or the screenshot: node scripts/site-og-image.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, launchChrome, loadPlaywright } from './pw.mjs';

const uri = (file, type) => `data:${type};base64,${readFileSync(join(PLUGIN_ROOT, file)).toString('base64')}`;
const font = (file) => uri(file, 'font/woff2');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "DM Sans"; src: url(${font('site/fonts/dm-sans.woff2')}) format("woff2"); font-weight: 100 1000; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; color: #fff; font-family: "DM Sans", sans-serif;
  -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(60% 70% at 18% 115%, rgba(255, 122, 46, 0.42), transparent 70%),
    radial-gradient(80% 60% at 85% -15%, rgba(255, 255, 255, 0.08), transparent 70%),
    linear-gradient(180deg, #0c0c0c 0%, #1b1b1b 45%, #3a3634 100%); }
.brand { position: absolute; left: 64px; top: 56px; display: flex; align-items: center; gap: 14px; font: 500 26px/1 "DM Sans", sans-serif; }
.brand img { width: 44px; height: 44px; }
h1 { position: absolute; left: 64px; top: 148px; width: 520px; margin: 0; font: 500 60px/1.02 "DM Sans", sans-serif;
  letter-spacing: -2.1px; text-wrap: balance; }
.sub { position: absolute; left: 64px; top: 432px; width: 480px; margin: 0; font-size: 23px; line-height: 1.4; color: #c9c9c9; }
.tags { position: absolute; left: 64px; bottom: 52px; display: flex; gap: 10px; font: 500 16px/1 "DM Sans", sans-serif; }
.tags span { padding: 9px 15px; border-radius: 999px; background: rgba(0, 0, 0, 0.35); box-shadow: rgba(255, 255, 255, 0.14) 0 0 0 1px inset; color: #ededed; }
.shot { position: absolute; left: 640px; top: 118px; width: 720px; border-radius: 24px; overflow: hidden;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5), rgba(255, 255, 255, 0.14) 0 0 0 1px; }
.shot img { display: block; width: 100%; }
</style></head><body>
<div class="brand"><img src="${uri('assets/logo/mark.svg', 'image/svg+xml')}" alt="">demo-studio</div>
<h1>Demo videos of your real app, made by your coding agent.</h1>
<p class="sub">It plans, records, cuts and narrates the video. Free, local, open source.</p>
<div class="tags"><span>Claude Code</span><span>Codex</span><span>Cursor</span><span>Gemini CLI</span></div>
<div class="shot"><img src="${uri('docs/img/sample-showcase-poster.jpg', 'image/jpeg')}" alt=""></div>
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
