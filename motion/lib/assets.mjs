// Collects every media reference in a storyboard and prepares it for the browser:
// stills are served as-is (cropped ones are re-encoded), clips and GIFs become JPEG frame folders.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const MEDIA_KEYS = new Set(['media', 'medias', 'images', 'logo', 'mark', 'icon']);
const VIDEO = /\.(mp4|mov|webm|m4v|gif)$/i;

/** Every media spec (string or clip object) in the board, keyed the way the runtime looks them up. */
export function collectMedia(board) {
  const found = new Map();
  const visit = (node, key) => {
    if (Array.isArray(node)) return node.forEach((n) => visit(n, key));
    if (node && typeof node === 'object') {
      if (MEDIA_KEYS.has(key) && typeof node.src === 'string') { found.set(JSON.stringify(node), node); return; }
      for (const [k, v] of Object.entries(node)) visit(v, k);
      return;
    }
    if (typeof node === 'string' && MEDIA_KEYS.has(key)) found.set(node, node);
  };
  visit(board, '');
  return found;
}

export function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`cannot read media ${file}: ${r.stderr.trim()}`);
  const [w, h] = r.stdout.trim().split(',').map(Number);
  return { width: w, height: h };
}

function svgSize(file) {
  const text = readFileSync(file, 'utf8');
  const vb = text.match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/);
  return vb ? { width: Number(vb[1]), height: Number(vb[2]) } : { width: 100, height: 100 };
}

function ffmpeg(args, what) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${what} failed: ${r.stderr.slice(-500)}`);
}

function cropFilter(crop) {
  if (!crop) return '';
  const [x, y, w, h] = crop;
  return `crop=floor(iw*${w}/2)*2:floor(ih*${h}/2)*2:iw*${x}:ih*${y},`;
}

/**
 * Prepare media. Returns {assets: {key: descriptor}, files: Set(abs paths to serve)}.
 * Clip frames are cached under cacheDir/<hash>/ and reused across sizes and runs.
 */
export function prepareMedia(board, storyboardPath, cacheDir, fps, { maxWidth = 1920 } = {}) {
  const base = dirname(resolve(storyboardPath));
  const assets = {};
  const files = new Set();
  for (const [key, spec] of collectMedia(board)) {
    const s = typeof spec === 'string' ? { src: spec } : spec;
    const abs = resolve(base, s.src);
    if (!existsSync(abs)) throw new Error(`missing asset ${s.src} (resolved ${abs})`);
    const isClip = VIDEO.test(abs);
    if (!isClip && !s.crop && s.maxWidth == null) {
      const size = abs.endsWith('.svg') ? svgSize(abs) : probe(abs);
      assets[key] = { kind: 'image', url: `/file${abs}`, ...size };
      files.add(abs);
      continue;
    }
    const width = s.maxWidth ?? maxWidth;
    const hash = createHash('sha1').update(JSON.stringify({ abs, from: s.from, to: s.to, crop: s.crop, fps, maxWidth: width, v: 2 })).digest('hex').slice(0, 16);
    const dir = join(cacheDir, hash);
    if (!existsSync(join(dir, 'done'))) {
      const tmp = `${dir}.tmp`;
      mkdirSync(tmp, { recursive: true });
      const vf = `${cropFilter(s.crop)}scale='min(${width},iw)':-2:flags=lanczos`;
      if (isClip) {
        const range = [...(s.from != null ? ['-ss', String(s.from)] : []), ...(s.to != null ? ['-to', String(s.to)] : [])];
        ffmpeg([...range, '-i', abs, '-vf', `fps=${fps},${vf}`, '-q:v', '2', join(tmp, '%05d.jpg')], `extract ${s.src}`);
      } else {
        ffmpeg(['-i', abs, '-vf', vf, '-q:v', '2', join(tmp, '00001.jpg')], `crop ${s.src}`);
      }
      ffmpeg(['-f', 'lavfi', '-i', 'anullsrc', '-t', '0.01', join(tmp, 'done.wav')], 'marker');
      renameSync(tmp, dir);
      renameSync(join(dir, 'done.wav'), join(dir, 'done'));
    }
    const frames = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
    if (!frames.length) throw new Error(`no frames extracted from ${s.src} (check from/to)`);
    const size = probe(join(dir, frames[0]));
    files.add(dir);
    assets[key] = isClip
      ? { kind: 'clip', dir: `/file${dir}`, count: frames.length, fps, rate: s.rate ?? 1, ...size }
      : { kind: 'image', url: `/file${join(dir, frames[0])}`, ...size };
  }
  return { assets, files };
}

/**
 * uiFocus dives into one region of its media. Gives that media enough pixels for the zoom (the default
 * 1920 px cap would make a 2x zoom soft) and returns a warning for each zoom the source is too small for.
 * A region `focus[2]` wide fills about the frame width, so it needs frameWidth / focus[2] source pixels.
 */
export function planZoomSources(board, storyboardPath, frameWidth) {
  const base = dirname(resolve(storyboardPath));
  const warnings = [];
  (board.scenes || []).forEach((scene, i) => {
    if (scene.type !== 'uiFocus' || !scene.media || !Array.isArray(scene.focus)) return;
    if (typeof scene.media === 'string') scene.media = { src: scene.media };
    const s = scene.media;
    const abs = resolve(base, s.src);
    if (!existsSync(abs) || abs.endsWith('.svg')) return;
    const need = Math.min(3840, Math.ceil(frameWidth / scene.focus[2] / 2) * 2);
    s.maxWidth ??= Math.max(1920, need);
    const source = probe(abs).width * (s.crop ? s.crop[2] : 1);
    const stretch = need / source;
    if (stretch > 1.25) {
      warnings.push(`scenes[${i}] uiFocus stretches ${s.src} ${stretch.toFixed(1)}x and will look soft: `
        + `record that take closer (zoom the page so the region fills the frame) or at full resolution `
        + `(encode-take.sh with OUT_SIZE=2880x1620), or widen focus`);
    }
  });
  return warnings;
}
