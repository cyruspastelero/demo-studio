#!/usr/bin/env node
// Render a storyboard to video, deterministically: seek the runtime to each frame time, screenshot,
// pipe PNGs to ffmpeg; then mix music + SFX cues with two-pass loudnorm and mux.
//
//   node render-motion.mjs <storyboard.json> --size 16x9|4x5|9x16 --out <file.mp4>
//        [--style <name>] [--from <s>] [--to <s>] [--no-audio] [--check]
//        [--stills <t1,t2,...> --stills-dir <dir>]
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { validateStoryboard, validateStyle, repetitionWarnings } from './lib/validate.mjs';
import { resolveScenes, totalDuration } from './lib/timing.mjs';
import { planZoomSources, prepareMedia } from './lib/assets.mjs';
import { startServer, fileUrl } from './lib/server.mjs';
import { renderMix, loudnessReport } from './lib/mix.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SIZES = { '16x9': [1920, 1080], '4x5': [1080, 1350], '9x16': [1080, 1920], '1x1': [1080, 1080] };
const ROOT = resolve(HERE, '..');
const STYLES_DIR = join(ROOT, 'motion-templates');
const FONT_DIRS = [join(ROOT, 'assets', 'fonts'), join(ROOT, 'site', 'fonts')];
const SFX_DIR = join(HERE, 'sfx');
const SFX_NAMES = ['whoosh', 'swish', 'click', 'tick', 'pop', 'hit', 'sparkle', 'typing'];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
  }
  return args;
}

const readJson = (p, what) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (error) { throw new Error(`cannot read ${what} ${p}: ${error.message}`); }
};

/** Load, validate and time a storyboard. Throws with every problem listed. */
export function loadProject(storyboardPath, styleOverride) {
  const board = readJson(storyboardPath, 'storyboard');
  const errors = validateStoryboard(board, readJson(join(HERE, 'schema/storyboard.schema.json'), 'schema'), storyboardPath);
  const styleName = styleOverride || board.style || 'airy';
  const dirs = [process.env.MOTION_TEMPLATES_DIR, STYLES_DIR].filter(Boolean);
  const stylePath = dirs.map((d) => join(d, styleName, 'style.json')).find((f) => existsSync(f)) || join(STYLES_DIR, styleName, 'style.json');
  if (!existsSync(stylePath)) errors.push(`style: no style named "${styleName}" (looked for ${stylePath})`);
  const style = existsSync(stylePath) ? readJson(stylePath, 'style') : null;
  if (style) errors.push(...validateStyle(style, readJson(join(HERE, 'schema/style.schema.json'), 'schema')).map((e) => `style ${styleName}: ${e}`));
  if (errors.length) throw new Error(`storyboard ${storyboardPath} is not valid:\n  - ${errors.join('\n  - ')}`);
  const base = dirname(resolve(storyboardPath));
  const timing = { ...(board.timing || {}) };
  if (timing.beatsFrom) {
    const beats = readJson(resolve(base, timing.beatsFrom), 'beats');
    timing.bpm ??= beats.bpm;
    if (timing.offset == null && beats.offset != null) {
      // The beats file times the music file; the mix starts it at musicStart, so shift the grid.
      const beat = 60 / timing.bpm, musicStart = board.audio?.musicStart || 0;
      timing.offset = (((beats.offset - musicStart) % beat) + beat) % beat;
    }
  }
  const fps = board.fps || 30;
  const timeline = resolveScenes(board.scenes, timing, fps);
  const duration = totalDuration(timeline, timing.tail ?? 0);
  return { board, style, styleName, timing, fps, timeline, duration, base };
}

async function openRuntime(project, size, cacheDir) {
  const { board, style, fps, timeline, timing, base } = project;
  planZoomSources(board, project.storyboardPath, size[0]);
  const { assets, files } = prepareMedia(board, project.storyboardPath, cacheDir, fps);
  const boardForPage = structuredClone(board);
  for (const f of Object.values(boardForPage.brand.fonts || {})) { const abs = resolve(base, f.src); files.add(abs); f.url = fileUrl(abs); }
  const { server, port } = await startServer(HERE, files, FONT_DIRS);
  let browser = null;
  const close = async () => { try { if (browser) await browser.close(); } finally { server.close(); } };
  try {
    const { chromium } = createRequire(import.meta.url)(process.env.MOTION_PLAYWRIGHT || 'playwright-core');
    browser = await chromium.launch({ channel: 'chrome', args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', '--disable-gpu', '--disable-gpu-rasterization', '--disable-partial-raster', '--num-raster-threads=1', '--disable-skia-runtime-opts'] });
    const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
    page.on('pageerror', (e) => logs.push(`page error: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/engine/index.html`);
    await page.waitForFunction(() => window.motionReady === true, null, { timeout: 15000 }).catch(() => { throw new Error(`runtime did not start: ${logs.join(' | ')}`); });
    const beat = timing.bpm ? 60 / timing.bpm : 1;
    const result = await page.evaluate((cfg) => window.motion.load(cfg).catch((e) => ({ error: e.message })), { board: boardForPage, style, assets, timeline, beat, size: { w: size[0], h: size[1] } });
    if (result.error) throw new Error(`runtime load failed: ${result.error}`);
    return { page, result, logs, close };
  } catch (error) {
    await close().catch((closeError) => process.stderr.write(`closing the runtime failed: ${closeError.message}\n`));
    throw error;
  }
}

function encoder(out, fps, { stillsDir } = {}) {
  if (stillsDir) return null;
  const ff = spawn('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  let failure = null;
  const done = new Promise((ok, fail) => {
    ff.on('error', (error) => fail(new Error(`ffmpeg encode could not start: ${error.message}`)));
    ff.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg encode exited ${code}`))));
  });
  done.catch((error) => { failure = error; });
  ff.stdin.on('error', (error) => { failure ??= new Error(`ffmpeg encode input failed: ${error.message}`); });
  const write = (buf) => {
    if (failure) return Promise.reject(failure);
    return new Promise((ok, fail) => {
      if (ff.stdin.write(buf)) return ok();
      ff.stdin.once('drain', ok);
      done.catch(fail);
    });
  };
  return { write, end: async () => { if (failure) throw failure; ff.stdin.end(); await done; } };
}

/** The synthesised SFX kit in motion/sfx (made by make-sfx.mjs on first use). */
function builtinSfx() {
  if (!SFX_NAMES.every((n) => existsSync(join(SFX_DIR, `${n}.wav`)))) {
    const r = spawnSync(process.execPath, [join(HERE, 'make-sfx.mjs'), SFX_DIR], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`making the SFX kit failed: ${r.stderr}`);
  }
  return Object.fromEntries(SFX_NAMES.map((n) => [n, join(SFX_DIR, `${n}.wav`)]));
}

/** A warning when the music runs out before the ad ends (the mix pads it with silence). */
function musicLengthWarnings(project) {
  const audio = project.board.audio || {};
  if (!audio.music) return [];
  const file = resolve(project.base, audio.music);
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const length = Number(r.stdout?.trim());
  if (r.status !== 0 || !Number.isFinite(length)) throw new Error(`cannot read the length of ${audio.music}: ${(r.stderr || r.error?.message || '').trim()}`);
  const needed = (audio.musicStart || 0) + project.duration;
  if (length >= needed) return [];
  return [`audio.music ${audio.music} is ${length.toFixed(2)} s long but musicStart + the ad need ${needed.toFixed(2)} s; the last ${(needed - length).toFixed(2)} s will have no music`];
}

export async function render(storyboardPath, opts) {
  if (!opts.check && !opts.stills && !String(opts.out).endsWith('.mp4')) {
    throw new Error(`--out must end in .mp4 (got ${opts.out}); the timeline and audio files are named after it`);
  }
  const project = loadProject(storyboardPath, opts.style);
  project.storyboardPath = storyboardPath;
  if (opts.check) {
    const warnings = [...planZoomSources(structuredClone(project.board), storyboardPath, 1920), ...musicLengthWarnings(project), ...repetitionWarnings(project.board)];
    return { project, warnings };
  }
  const size = SIZES[opts.size || '16x9'];
  if (!size) throw new Error(`--size must be one of ${Object.keys(SIZES).join(', ')}`);
  const cacheDir = process.env.MOTION_CACHE || join(dirname(resolve(storyboardPath)), '.motion-cache');
  mkdirSync(cacheDir, { recursive: true });
  for (const w of repetitionWarnings(project.board)) process.stderr.write(`warning: ${w}\n`);
  if (!opts.stills && !opts['no-audio']) for (const w of musicLengthWarnings(project)) process.stderr.write(`warning: ${w}\n`);
  const { page, result, logs, close } = await openRuntime(project, size, cacheDir);
  const temps = [];
  try {
    if (result.warnings.length) throw new Error(`storyboard problems:\n  - ${result.warnings.join('\n  - ')}`);
    const fps = project.fps;
    const from = Number(opts.from ?? 0), to = Math.min(Number(opts.to ?? project.duration), project.duration);
    if (opts.stills) {
      mkdirSync(opts['stills-dir'], { recursive: true });
      const shots = [];
      for (const t of String(opts.stills).split(',').map(Number)) {
        const ft = Math.round(t * fps) / fps;
        await page.evaluate((x) => window.motion.seek(x), ft);
        const file = join(opts['stills-dir'], `${opts.prefix || basename(storyboardPath, '.json')}-${opts.size || '16x9'}-${ft.toFixed(2)}.png`);
        await page.screenshot({ path: file, type: 'png' });
        shots.push(file);
      }
      return { project, shots, logs };
    }
    const out = resolve(opts.out);
    mkdirSync(dirname(out), { recursive: true });
    const videoOnly = opts['no-audio'] ? out : out.replace(/\.mp4$/, '.video.mp4');
    if (videoOnly !== out) temps.push(videoOnly);
    const enc = encoder(videoOnly, fps);
    const first = Math.round(from * fps), last = Math.round(to * fps);
    const t0 = Date.now();
    for (let f = first; f < last; f++) {
      await page.evaluate((x) => window.motion.seek(x), f / fps);
      await enc.write(await page.screenshot({ type: 'png' }));
      if ((f - first) % 150 === 0) process.stderr.write(`frame ${f - first}/${last - first} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
    }
    await enc.end();
    if (logs.length) process.stderr.write(`runtime messages:\n  ${logs.join('\n  ')}\n`);
    const cues = result.cues;
    writeFileSync(out.replace(/\.mp4$/, '.timeline.json'), JSON.stringify({ duration: project.duration, bpm: project.timing.bpm, offset: project.timing.offset, scenes: project.timeline.map((s, i) => ({ ...s, type: project.board.scenes[i].type })), cues }, null, 2));
    if (opts['no-audio']) return { project, out };
    const audio = project.board.audio || {};
    const base = project.base;
    const sfx = { ...builtinSfx(), ...Object.fromEntries(Object.entries(audio.sfx || {}).map(([k, v]) => [k, resolve(base, v)])) };
    const raw = out.replace(/\.mp4$/, '.raw.wav'), norm = out.replace(/\.mp4$/, '.mix.wav');
    temps.push(raw, norm);
    const mix = renderMix({ music: audio.music ? resolve(base, audio.music) : null, musicStart: audio.musicStart || 0, musicGainDb: audio.musicGainDb || 0, duration: project.duration, fadeOut: audio.fadeOut ?? 1.5, cues, sfx, sfxGainDb: audio.sfxGainDb ?? -10, window: [from, to] }, raw, norm, { loudness: audio.loudness ?? -14, truePeak: audio.truePeak ?? -1.5 });
    if (mix.missing.length) process.stderr.write(`no SFX file for cue(s): ${mix.missing.join(', ')} (skipped)\n`);
    const mux = spawn('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', videoOnly, '-i', norm, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
    await new Promise((ok, fail) => mux.on('close', (c) => (c === 0 ? ok() : fail(new Error(`mux exited ${c}`)))));
    return { project, out, loudness: loudnessReport(out) };
  } finally {
    for (const f of temps) rmSync(f, { force: true });
    await close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const storyboard = args._[0];
  if (!storyboard || (!args.out && !args.check && !args.stills)) {
    console.error('usage: node render-motion.mjs <storyboard.json> --size 16x9|4x5|9x16 --out <file.mp4> [--style name] [--from s --to s] [--no-audio] [--check] [--stills t1,t2 --stills-dir dir]');
    process.exit(2);
  }
  render(storyboard, args).then((r) => {
    const p = r.project;
    console.log(JSON.stringify({ ok: true, style: p.styleName, duration: Number(p.duration.toFixed(3)), bpm: p.timing.bpm ?? null, scenes: p.timeline.length, out: r.out, shots: r.shots?.length, loudness: r.loudness, ...(r.warnings?.length ? { warnings: r.warnings } : {}) }));
  }).catch((error) => { console.error(error.message); process.exit(1); });
}
