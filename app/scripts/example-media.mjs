#!/usr/bin/env node
// Makes stand-in takes for every raw take a demo folder's handoff.json and demo.json name but do not
// have, so the editor can be tried (and tested) without real footage.
//   default:   320x180 test patterns, fast, for the tests.
//   --slates:  1280x720 slates that name the shot and say what it shows (from handoff.json `screen` or
//              the demo.json caption), with a bar sweeping across so playback visibly moves. Drawn
//              with headless Chrome (no ffmpeg drawtext needed). "Try a copy" on the home screen
//              uses this for examples that ship no footage.
// Each take is about 1 second longer than the furthest out point used.
// Usage: node app/scripts/example-media.mjs <demo-folder> [--size 320x180] [--slates]
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIN_SECONDS = 6;
const HEADER = 'file,scene,take,duration_s,resolution,fps,recorded_at,status,notes\n';
const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

// file name -> furthest out point any shot uses
export function neededTakes(handoff, demo) {
  const need = new Map();
  const use = (file, out) => need.set(file, Math.max(need.get(file) ?? 0, out ?? 0));
  for (const shot of Object.values(handoff?.shots ?? {})) use(shot.source, shot.out);
  for (const video of handoff?.videos ?? []) {
    for (const scene of video.scenes) {
      for (const shot of scene.shots) {
        if (shot.source) use(shot.source, shot.out);
        if (shot.ref && handoff.shots?.[shot.ref]) use(handoff.shots[shot.ref].source, shot.out ?? handoff.shots[shot.ref].out);
      }
    }
  }
  for (const item of demo?.sequence ?? []) {
    if (item.stem) use(`${item.stem}-t${item.take ?? 1}.mp4`, item.trim?.[1] ?? 0);
  }
  return need;
}

// file name -> what the take shows, for the slate: handoff.json `screen`, else the demo.json caption.
export function takeNotes(handoff, demo) {
  const notes = new Map();
  // The longest description wins (handoff.json often says just "Site hero"); one that only repeats the
  // take's own name adds nothing to the slate.
  const note = (file, text) => {
    const same = (a) => a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!file || !text || same(text) === same(takeTitle(file).replace(/^\S+ · /, ''))) return;
    if ((notes.get(file) ?? '').length < text.length) notes.set(file, text);
  };
  for (const shot of Object.values(handoff?.shots ?? {})) note(shot.source, shot.screen);
  for (const video of handoff?.videos ?? []) {
    for (const scene of video.scenes) for (const shot of scene.shots) note(shot.source, shot.screen);
  }
  for (const item of demo?.sequence ?? []) if (item.stem) note(`${item.stem}-t${item.take ?? 1}.mp4`, item.caption);
  return notes;
}

// "06-site-hero-t1.mp4" -> "06 · Site hero"
export function takeTitle(file) {
  const match = /^(\d+[a-z]?)-(.+?)(?:-t\d+)?\.mp4$/.exec(file);
  if (!match) return file;
  const words = match[2].replace(/-/g, ' ');
  return `${match[1]} · ${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function slateHtml(face, title, note) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${face}
html, body { margin: 0; width: 1280px; height: 720px; background: #F3F3F6; font-family: 'dsf-inter', sans-serif;
  -webkit-font-smoothing: antialiased; }
.card { position: absolute; left: 100px; top: 70px; width: 1080px; height: 540px; box-sizing: border-box; padding: 72px 80px;
  background: #fff; border-radius: 22px; box-shadow: 0 24px 60px rgba(40, 30, 50, 0.10); }
.eyebrow { font-size: 18px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #D2430E; }
h1 { margin: 22px 0 0; font-size: 60px; font-weight: 600; letter-spacing: -1.5px; color: #171717; }
p { margin: 26px 0 0; max-width: 900px; font-size: 30px; line-height: 1.35; color: #4D4D4D; }
.foot { position: absolute; left: 80px; bottom: 60px; font-size: 20px; color: #8F8F8F; }
</style></head><body><div class="card"><div class="eyebrow">Sample footage</div><h1>${escapeHtml(title)}</h1>
${note ? `<p>${escapeHtml(note)}</p>` : ''}<div class="foot">Record the real take with Claude and it replaces this clip.</div></div></body></html>`;
}

async function renderSlates(takes, notes) {
  const { launchChrome, loadPlaywright } = await import(pathToFileURL(join(REPO, 'scripts', 'pw.mjs')).href);
  const { fontFaceCss } = await import(pathToFileURL(join(REPO, 'scripts', 'fonts.mjs')).href);
  const face = fontFaceCss(REPO, 'inter').replace(/font-family: '[^']+'/, "font-family: 'dsf-inter'");
  const dir = mkdtempSync(join(tmpdir(), 'slates-'));
  const { chromium } = await loadPlaywright();
  const browser = await launchChrome(chromium);
  const images = new Map();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, javaScriptEnabled: false });
    await context.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort()));
    const page = await context.newPage();
    for (const file of takes) {
      await page.setContent(slateHtml(face, takeTitle(file), notes.get(file)));
      await page.evaluate(() => document.fonts.ready);
      const png = join(dir, `${file}.png`);
      await page.screenshot({ path: png });
      images.set(file, png);
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return { dir, images };
}

function encode(target, seconds, size, index, slate) {
  const [w, h] = size.split('x').map(Number);
  const args = slate
    // The slate, with an accent bar sweeping across the bottom over the clip's length.
    ? ['-loop', '1', '-framerate', '30', '-t', String(seconds), '-i', slate,
      '-f', 'lavfi', '-i', `color=c=0xFC5E32:s=${Math.round(w / 6)}x6:r=30:d=${seconds}`,
      '-filter_complex', `[0:v]scale=${w}:${h}[s];[s][1:v]overlay=x='-w+(W+w)*t/${seconds}':y=H-6`]
    // A light, mostly still frame with one moving test block, like a screen recording of an app.
    : ['-f', 'lavfi', '-i', `color=c=0xF3F3F6:s=${size}:r=30:d=${seconds}`,
      '-f', 'lavfi', '-i', `testsrc2=s=${Math.round(w / 3)}x${Math.round(h / 3)}:r=30:d=${seconds}`,
      '-filter_complex', `[1:v]hue=h=${(index * 47) % 360}[b];[0:v][b]overlay=x='${Math.round(w / 10)}+t*${Math.round(w / 30)}':y=${Math.round(h / 3)}`];
  return spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target],
  { stdio: 'inherit' });
}

async function main() {
  const args = process.argv.slice(2);
  const sizeAt = args.indexOf('--size');
  const folder = args.find((a, i) => !a.startsWith('--') && (sizeAt < 0 || i !== sizeAt + 1));
  if (!folder) {
    console.error('usage: example-media.mjs <demo-folder> [--size 320x180] [--slates]');
    process.exit(2);
  }
  const slates = args.includes('--slates');
  const size = args.includes('--size') ? args[args.indexOf('--size') + 1] : slates ? '1280x720' : '320x180';
  const root = resolve(folder);
  const handoff = readJson(join(root, 'handoff.json'));
  const demo = readJson(join(root, 'demo.json'));
  const raw = join(root, handoff?.paths?.raw ?? 'recordings/raw');
  mkdirSync(raw, { recursive: true });
  const csv = join(root, 'recordings', 'takes.csv');
  if (!existsSync(csv)) writeFileSync(csv, HEADER);
  const missing = [...neededTakes(handoff, demo)].filter(([file]) => !existsSync(join(raw, file)));
  const rendered = slates && missing.length ? await renderSlates(missing.map(([file]) => file), takeNotes(handoff, demo)) : null;
  try {
    missing.forEach(([file, out], index) => {
      const seconds = Math.max(MIN_SECONDS, Math.ceil(out + 1));
      const result = encode(join(raw, file), seconds, size, index, rendered?.images.get(file));
      if (result.status !== 0) {
        console.error(`example-media: ffmpeg failed for ${file}`);
        process.exit(1);
      }
      const scene = file.replace(/-t\d+\.mp4$/, '');
      const take = /-t(\d+)\.mp4$/.exec(file)?.[1] ?? '1';
      // A take the log already lists (the example's own takes.csv) keeps its row.
      if (!readFileSync(csv, 'utf8').includes(`raw/${file},`)) {
        appendFileSync(csv, `raw/${file},${scene},${take},${seconds}.0,${size},30,2026-01-01T00:00,keep,"${slates ? 'sample slate' : 'synthetic test pattern'}"\n`);
      }
      console.log(`PROGRESS sample-takes ${index + 1}/${missing.length}`);
    });
  } finally {
    if (rendered) rmSync(rendered.dir, { recursive: true, force: true });
  }
  console.log(`example-media: made ${missing.length} ${slates ? 'sample slate' : 'synthetic'} take(s) in ${raw}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`example-media: ${error.message}`);
    process.exit(1);
  });
}
