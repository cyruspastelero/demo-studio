import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { PathError, resolveInside } from './paths.mjs';

const TYPES = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json', '.aiff': 'audio/aiff', '.zip': 'application/zip',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
// Demo folders come from other people, so /media/ only serves passive types inline. HTML, SVG or
// script from a demo folder would run on the editor's origin and could call its local API.
const PASSIVE = new Set(['.mp4', '.mov', '.png', '.jpg', '.jpeg', '.aiff', '.txt']);
const MEDIA_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
};
// Demo media is untrusted: ffmpeg may only read local files and pipes, never follow a playlist or
// reference inside a crafted file out to a URL (same rule as scripts/demolib.py PROTOCOL_WHITELIST).
export const PROTOCOL_WHITELIST = ['-protocol_whitelist', 'file,pipe'];
// ffmpeg picks a demuxer from content, not the name: a ".mp4" that is really a concat list could pull in
// other files. Untrusted media may only use plain media demuxers (same list as scripts/demolib.py).
export const FORMAT_WHITELIST = ['-format_whitelist', 'mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,wav,mp3,aac,flac,ogg,aiff,image2,png_pipe,jpeg_pipe,mjpeg'];
const THUMB_CACHE_LIMIT = 400;
const THUMB_WORKERS = 3;

export function contentType(file) {
  return TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

// Byte-range responses, so <video> can seek without downloading the whole take.
export function isPassiveMedia(file) {
  return PASSIVE.has(extname(file).toLowerCase());
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
}

// A read error (file removed mid-stream, permissions) ends this response only; it must never
// become an unhandled 'error' event, which would stop the whole server.
function stream(res, file, options) {
  const source = createReadStream(file, options);
  source.on('error', (error) => {
    console.error(`studio: could not read ${basename(file)}: ${error.code ?? error.message}`);
    if (!res.headersSent) notFound(res);
    else res.destroy(error);
  });
  res.on('close', () => source.destroy());
  source.pipe(res);
}

// Only regular files are served. A folder (EISDIR), socket or missing path is a 404; any page in
// the browser can point an <img> at 127.0.0.1, so this path must never throw.
export function sendFile(req, res, file, { untrusted = false } = {}) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return notFound(res);
  }
  if (!stat.isFile()) return notFound(res);
  const { size } = stat;
  const passive = isPassiveMedia(file);
  const type = untrusted && !passive ? 'application/octet-stream' : contentType(file);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  let headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  if (untrusted) {
    headers = { ...headers, ...MEDIA_HEADERS };
    if (!passive) headers = { ...headers, 'Content-Disposition': `attachment; filename="${basename(file).replace(/"/g, '')}"` };
  }
  if (!range) {
    res.writeHead(200, { ...headers, 'Content-Length': size });
    if (req.method === 'HEAD') return res.end();
    return stream(res, file);
  }
  let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
  let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  if (start > end || Number.isNaN(start)) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` });
    return res.end();
  }
  res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
  if (req.method === 'HEAD') return res.end();
  return stream(res, file, { start, end });
}

function run(cmd, args, { binary = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code) reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`));
      else resolvePromise(binary ? Buffer.concat(out) : Buffer.concat(out).toString('utf8'));
    });
  });
}

const durations = new Map();
export async function probeDuration(file) {
  const key = `${file}:${statSync(file).mtimeMs}`;
  if (durations.has(key)) return durations.get(key);
  try {
    const out = await run('ffprobe', [...PROTOCOL_WHITELIST, ...FORMAT_WHITELIST, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    const value = Number.parseFloat(out.trim());
    const result = Number.isFinite(value) ? value : null;
    durations.set(key, result);
    return result;
  } catch (error) {
    console.error(`studio: ffprobe failed for ${basename(file)}: ${error.message}`);
    return null;
  }
}

const thumbs = new Map();
const queue = [];
let active = 0;
function pump() {
  while (active < THUMB_WORKERS && queue.length) {
    const job = queue.shift();
    active += 1;
    job().finally(() => {
      active -= 1;
      pump();
    });
  }
}

export function thumbnail(file, seconds, width) {
  const key = `${file}:${statSync(file).mtimeMs}:${seconds.toFixed(2)}:${width}`;
  if (thumbs.has(key)) return thumbs.get(key);
  const promise = new Promise((resolvePromise, reject) => {
    queue.push(() => run('ffmpeg', ['-v', 'error', '-ss', String(seconds), ...PROTOCOL_WHITELIST, ...FORMAT_WHITELIST, '-i', file, '-frames:v', '1',
      '-vf', `scale=${width}:-2`, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '5', '-'], { binary: true })
      .then(resolvePromise, reject));
    pump();
  });
  thumbs.set(key, promise);
  promise.catch(() => thumbs.delete(key));
  if (thumbs.size > THUMB_CACHE_LIMIT) thumbs.delete(thumbs.keys().next().value);
  return promise;
}

// A tiny CSV reader for takes.csv (quoted fields, doubled quotes).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((v) => v.trim()));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

function takeStatuses(folder) {
  const csv = join(folder, 'recordings', 'takes.csv');
  if (!existsSync(csv)) return new Map();
  const statuses = new Map();
  for (const row of parseCsv(readFileSync(csv, 'utf8'))) {
    if (row.file) statuses.set(basename(row.file), { status: row.status ?? '', notes: row.notes ?? '' });
  }
  return statuses;
}

function pngs(folder, dir, strip) {
  const out = {};
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.png') && name.startsWith('card-')) {
      out[strip ? name.slice(5, -4) : name.slice(0, -4)] = relative(folder, join(dir, name));
    }
  }
  return out;
}

// handoff.paths.* resolved inside the demo folder; a missing folder or one that would leave the
// demo folder lists nothing.
export function demoDir(folder, value) {
  try {
    return resolveInside(folder, value);
  } catch (error) {
    if (error instanceof PathError) return null;
    throw error;
  }
}

export async function mediaIndex(folder, handoff) {
  const rawDir = demoDir(folder, handoff?.paths?.raw ?? 'recordings/raw');
  const outDir = demoDir(folder, handoff?.paths?.out ?? 'recordings/editor-handoff');
  const cardsDir = handoff?.paths?.cards ? demoDir(folder, handoff.paths.cards)
    : outDir && join(outDir, 'assets', 'title-cards');
  const statuses = takeStatuses(folder);
  const files = rawDir && existsSync(rawDir) && statSync(rawDir).isDirectory() ? readdirSync(rawDir).filter((f) => /\.(mp4|mov)$/i.test(f)).sort() : [];
  const raw = await Promise.all(files.map(async (file) => ({
    file,
    path: relative(folder, join(rawDir, file)),
    duration: await probeDuration(join(rawDir, file)),
    ...(statuses.get(file) ?? {}),
  })));
  return {
    raw,
    cards: pngs(folder, cardsDir, false),
    keynoteCards: pngs(folder, join(folder, 'recordings', 'exports', '.keynote'), true),
  };
}
