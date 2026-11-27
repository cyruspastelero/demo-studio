// Shared helpers for the reference-ad analysis scripts. Plain Node, no deps.
// Pixels come from ffmpeg as raw rgb24; audio as mono f32le.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Optional: DEMO_STUDIO_HEAVY_LOCK names a script run as `bash <lock> <cmd> <args...>` that serialises
// heavy jobs (ffmpeg decodes). Unset or missing, heavy commands run directly.
export const HEAVY_LOCK = process.env.DEMO_STUDIO_HEAVY_LOCK && existsSync(process.env.DEMO_STUDIO_HEAVY_LOCK) ? process.env.DEMO_STUDIO_HEAVY_LOCK : null;

export function probe(video) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:format=duration', '-of', 'json', video]);
  const j = JSON.parse(out);
  const s = j.streams[0];
  const [n, d] = s.r_frame_rate.split('/').map(Number);
  return { width: s.width, height: s.height, fps: n / d, frames: Number(s.nb_frames), duration: Number(j.format.duration) };
}

// Run a command, collecting stdout as Buffer chunks via onChunk, stderr as text. heavy=true wraps it in the lock.
export function run(cmd, args, { heavy = false, onStdout, collectStdout = false } = {}) {
  const [c, a] = heavy && HEAVY_LOCK ? ['bash', [HEAVY_LOCK, cmd, ...args]] : [cmd, args];
  return new Promise((resolve, reject) => {
    const p = spawn(c, a, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let err = '';
    p.stdout.on('data', (b) => { if (onStdout) onStdout(b); else if (collectStdout) chunks.push(b); });
    p.stderr.on('data', (b) => { err += b.toString(); });
    p.on('error', reject);
    p.on('close', (code) => code === 0 ? resolve({ stdout: Buffer.concat(chunks), stderr: err })
      : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`)));
  });
}

// Decode frames of size w x h (rgb24) and call onFrame(buf, index) for each. start/dur in seconds (optional).
export async function eachFrame(video, { w, h, start, dur, fps, heavy = false, vfPre = '' }, onFrame) {
  const args = ['-v', 'error'];
  if (start != null) args.push('-ss', String(start));
  args.push('-i', video);
  if (dur != null) args.push('-t', String(dur));
  const vf = [vfPre, fps ? `fps=${fps}` : '', `scale=${w}:${h}:flags=area`].filter(Boolean).join(',');
  args.push('-vf', vf, '-an', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');
  const size = w * h * 3; let pending = Buffer.alloc(0); let i = 0;
  await run('ffmpeg', args, { heavy, onStdout: (b) => {
    pending = pending.length ? Buffer.concat([pending, b]) : b;
    while (pending.length >= size) { onFrame(Buffer.from(pending.subarray(0, size)), i++); pending = pending.subarray(size); }
  } });
  return i;
}

// One full-resolution frame at time t.
export async function grab(video, t, { w = 1920, h = 1080 } = {}) {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', video, '-frames:v', '1',
    '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { collectStdout: true });
  return { buf: stdout, w, h };
}

export const px = (f, x, y) => { const i = (y * f.w + x) * 3; return [f.buf[i], f.buf[i + 1], f.buf[i + 2]]; };
export const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
export const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

// Per-channel median colour of a square patch centred on (cx, cy).
export function patch(f, cx, cy, r = 10) {
  const ch = [[], [], []];
  for (let y = Math.max(0, cy - r); y <= Math.min(f.h - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(f.w - 1, cx + r); x++) { const p = px(f, x, y); ch[0].push(p[0]); ch[1].push(p[1]); ch[2].push(p[2]); }
  return ch.map(median);
}

// Dominant colours in a rect by 4-bit-per-channel quantisation; returns [{hex, share}] sorted by share.
export function dominant(f, { x = 0, y = 0, w = f.w, h = f.h } = {}, top = 6, step = 2) {
  const bins = new Map(); let n = 0;
  for (let yy = y; yy < y + h; yy += step) for (let xx = x; xx < x + w; xx += step) {
    const p = px(f, xx, yy); const k = (p[0] >> 4) << 8 | (p[1] >> 4) << 4 | (p[2] >> 4);
    const e = bins.get(k) || { s: [0, 0, 0], c: 0 }; e.s[0] += p[0]; e.s[1] += p[1]; e.s[2] += p[2]; e.c++; bins.set(k, e); n++;
  }
  return [...bins.values()].sort((a, b) => b.c - a.c).slice(0, top)
    .map((e) => ({ hex: hex(e.s.map((v) => v / e.c)), share: round(e.c / n, 3) }));
}

export function parseRect(s) { const [x, y, w, h] = s.split(/[,:x ]/).map(Number); return { x, y, w, h }; }
