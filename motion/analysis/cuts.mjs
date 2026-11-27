// Cut detection plus a per-frame signal track.
// Usage: node cuts.mjs <video> <out.json> [threshold=0.25]
// One heavy-locked ffmpeg pass: scene score for every frame (metadata print), the literal
// select='gt(scene,T)',showinfo branch for cut times, and a 128x72 rgb stream for per-frame stats
// (mean luma, mean abs diff to previous frame, edge energy as a sharpness/blur proxy).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { probe, run, HEAVY_LOCK, round, median } from './lib.mjs';
import { spawn } from 'node:child_process';

const [video, outPath, thrArg] = process.argv.slice(2);
if (!video || !outPath) { console.error('usage: node cuts.mjs <video> <out.json> [threshold]'); process.exit(2); }
const T = Number(thrArg ?? 0.25);
const info = probe(video);
const W = 128, H = 72, SIZE = W * H * 3;
const scoreFile = path.join(os.tmpdir(), `scene-${process.pid}.txt`);

const graph = `[0:v]select='gte(scene\\,0)',metadata=print:file=${scoreFile},split[a][b];` +
  `[a]select='gt(scene\\,${T})',showinfo,nullsink;[b]scale=${W}:${H}:flags=area,format=rgb24[o]`;
const args = ['-hide_banner', '-i', video, '-filter_complex', graph,
  '-map', '[o]', '-f', 'rawvideo', '-'];

const stats = []; let prev = null; let pending = Buffer.alloc(0); let stderr = '';
function frameStats(f) {
  let l = 0, d = 0, e = 0;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = 0.2126 * f[i * 3] + 0.7152 * f[i * 3 + 1] + 0.0722 * f[i * 3 + 2];
  for (let i = 0; i < W * H; i++) { l += lum[i]; if (prev) d += Math.abs(lum[i] - prev[i]); }
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; e += Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + W] - lum[i - W]);
  }
  prev = lum;
  return { luma: round(l / (W * H), 1), diff: round(d / (W * H), 2), edge: round(e / ((W - 2) * (H - 2)), 2) };
}
await new Promise((resolve, reject) => {
  const p = HEAVY_LOCK ? spawn('bash', [HEAVY_LOCK, 'ffmpeg', ...args], { stdio: ['ignore', 'pipe', 'pipe'] }) : spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (b) => {
    pending = pending.length ? Buffer.concat([pending, b]) : b;
    while (pending.length >= SIZE) { stats.push(frameStats(pending.subarray(0, SIZE))); pending = pending.subarray(SIZE); }
  });
  p.stderr.on('data', (b) => { stderr += b.toString(); });
  p.on('close', (c) => c === 0 ? resolve() : reject(new Error(`ffmpeg scene pass failed (${c}): ${stderr.slice(-600)}`)));
});

const cuts = [...stderr.matchAll(/showinfo.*?pts_time:\s*([\d.]+)/g)].map((m) => Number(m[1]));
const scores = fs.readFileSync(scoreFile, 'utf8').split('\n').filter((l) => l.includes('scene_score'))
  .map((l) => Number(l.split('=')[1]));
fs.unlinkSync(scoreFile);
stats.forEach((s, i) => { s.t = round(i / info.fps, 3); s.scene = round(scores[i] ?? 0, 4); });

const bounds = [0, ...cuts, info.duration];
const shots = bounds.slice(1).map((e, i) => round(e - bounds[i], 3));
const out = { video, fps: info.fps, duration: info.duration, threshold: T, cuts, shots,
  shotStats: { count: shots.length, median: median(shots), min: Math.min(...shots), max: Math.max(...shots) },
  frames: stats };
fs.writeFileSync(outPath, JSON.stringify(out));
console.log(JSON.stringify({ cuts, shotStats: out.shotStats }));
