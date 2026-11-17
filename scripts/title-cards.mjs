// Renders the title-card placeholders from handoff.json as 1920x1080 PNGs with the exact wording,
// in the brand's colours, font and logo. With --social it also renders the caption bands for
// the social versions (for ffmpeg builds without drawtext).
// Uses a short-lived headless Chrome through playwright-core, so no demo window has to be open.
// Usage: node title-cards.mjs [handoff.json] [--social]
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { launchChrome, loadPlaywright } from './pw.mjs';
import {
  CardInputError, blockRequests, checkBrand, escapeHtml as esc, imageDataUri, safeJoin,
} from './card-safety.mjs';

function fail(message) {
  console.error(`title-cards: ${message}`);
  process.exit(1);
}

// Every config value is checked before Chrome starts; a bad one names its field and stops.
function checked(fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof CardInputError) fail(error.message);
    throw error;
  }
}

const args = process.argv.slice(2);
const social = args.includes('--social');
const cfgPath = resolve(args.find((a) => !a.startsWith('--')) ?? 'handoff.json');
if (!existsSync(cfgPath)) {
  console.error(`title-cards: ${cfgPath} not found`);
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const root = dirname(cfgPath);
const outDir = checked(() => safeJoin(root, cfg.paths?.out ?? 'recordings/editor-handoff', 'paths.out'));
const cardsDir = cfg.paths?.cards
  ? checked(() => safeJoin(root, cfg.paths.cards, 'paths.cards'))
  : join(outDir, 'assets', 'title-cards');
const brand = checked(() => checkBrand({
  background: '#F6F6F8', title_color: '#1D1D1F', subtitle_color: '#6E6E73',
  font: "'SF Pro Display', system-ui, -apple-system, 'Helvetica Neue', sans-serif", ...cfg.brand,
}));
// Caption band size per aspect; must match LAYOUTS in social-cut.py.
const BANDS = { '4:5': [1080, 250], '9:16': [1080, 420] };

const dataUri = (file, field) => checked(() => imageDataUri(root, file, field));
const VIDEO_KEY = /^[A-Z][A-Z0-9-]*$/;

// Font lists go in a <style> block with single quotes; double quotes in a style attribute break them.
const style = (extra = '') => `<style>
  html,body{margin:0;background:${brand.background};font-family:${brand.font};-webkit-font-smoothing:antialiased;}
  .t{color:${brand.title_color};font-size:96px;font-weight:700;letter-spacing:-1.5px;text-align:center;line-height:1.08;}
  .s{color:${brand.subtitle_color};font-size:40px;margin-top:28px;text-align:center;}
  .logo{display:block;height:120px;margin:0 auto 48px;}
  .cast{display:flex;gap:160px;justify-content:center;margin-top:56px;}
  .p{text-align:center;} .p img{width:300px;height:300px;border-radius:50%;object-fit:cover;}
  .n{color:${brand.title_color};font-size:52px;font-weight:700;margin-top:28px;} .r{color:${brand.subtitle_color};font-size:36px;margin-top:8px;}
  ${extra}</style>`;

function cardHtml(name, card) {
  const logo = card.logo && brand.logo ? `<img class="logo" src="${dataUri(brand.logo, 'brand.logo')}">` : '';
  const people = (card.people ?? []).map((p, i) => `<div class="p">${p.photo ? `<img src="${dataUri(p.photo, `cards.${name}.people[${i}].photo`)}">` : ''}`
    + `<div class="n">${esc(p.name)}</div><div class="r">${esc(p.role)}</div></div>`).join('');
  return `<!doctype html><html><head>${style('body{width:1920px;height:1080px;display:grid;place-items:center;}')}</head><body><div>`
    + `${logo}<div class="t">${esc(card.title)}</div>`
    + (card.subtitle ? `<div class="s">${esc(card.subtitle)}</div>` : '')
    + (people ? `<div class="cast">${people}</div>` : '')
    + '</div></body></html>';
}

function captionHtml(text, [w, h]) {
  return `<!doctype html><html><head>${style(`html,body{background:transparent;} body{width:${w}px;height:${h}px;display:grid;place-items:center;}
    .c{color:${brand.title_color};font-size:58px;font-weight:700;letter-spacing:-0.5px;text-align:center;padding:0 60px;line-height:1.15;}`)}</head>`
    + `<body><div class="c">${esc(text)}</div></body></html>`;
}

const jobs = [];
for (const [name, card] of Object.entries(cfg.cards ?? {})) {
  if (!/^card-[a-z0-9-]+$/.test(name)) fail(`cards.${name}: card names must look like card-intro`);
  jobs.push({ html: cardHtml(name, card), path: join(cardsDir, `${name}.png`), size: [1920, 1080], transparent: false });
}
if (social) {
  for (const [index, entry] of (cfg.social ?? []).entries()) {
    if (!entry.input && !VIDEO_KEY.test(entry.video ?? '')) fail(`social[${index}].video must be a video key like PROMO`);
    if (!BANDS[entry.aspect]) fail(`social[${index}].aspect must be one of ${Object.keys(BANDS).join(', ')}`);
    const name = entry.input ? parse(entry.input).name : entry.video;
    const aspect = entry.aspect.replace(':', 'x');
    (entry.captions ?? []).forEach((cap, i) => {
      if (!cap.text || cap.png) return;
      jobs.push({ html: captionHtml(cap.text, BANDS[entry.aspect]), size: BANDS[entry.aspect], transparent: true,
        path: join(outDir, 'assets', 'social-captions', `${name}-${aspect}-${i + 1}.png`) });
    });
  }
}
if (jobs.length === 0) {
  console.error('title-cards: nothing to render (no "cards" in handoff.json, and no social captions with text)');
  process.exit(1);
}

const { chromium } = await loadPlaywright();
const browser = await launchChrome(chromium);
try {
  for (const [i, job] of jobs.entries()) {
    mkdirSync(dirname(job.path), { recursive: true });
    // No script and no requests: the page only lays out escaped text and inline data: images.
    const context = await browser.newContext({
      viewport: { width: job.size[0], height: job.size[1] }, deviceScaleFactor: 1, javaScriptEnabled: false,
    });
    await blockRequests(context);
    const page = await context.newPage();
    await page.setContent(job.html);
    await page.waitForTimeout(300);
    await page.screenshot({ path: job.path, omitBackground: job.transparent });
    await context.close();
    console.log(`PROGRESS title-cards ${i + 1}/${jobs.length}`);
    console.log(`OUTPUT ${job.path}`);
  }
} finally {
  await browser.close().catch(() => {});
}
