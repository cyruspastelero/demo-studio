// Tempo, beat phase, bar phase and cut-to-beat offsets. Plain Node, no deps.
// Usage: node tempo.mjs <video> <out.json> [--cuts=t1,t2,...] [--min=70] [--max=180]
// 1. ffmpeg (heavy-locked) decodes to mono f32le at 22050 Hz.
// 2. STFT (1024 / hop 256, Hann) -> log-magnitude spectral flux, minus a 0.5 s moving mean, half-wave rectified.
// 3. Autocorrelation of the onset envelope over the BPM range gives candidates; each candidate is refined
//    with a comb search (0.05 BPM steps x 2 ms phase steps) maximising mean envelope on the beat grid.
// 4. Bar phase: which beat (mod 4) carries the most low-band (< 150 Hz) flux.
// 5. Each cut gets its signed offset to the nearest beat and nearest half-beat, plus its beat index mod 4.
import fs from 'node:fs';
import { run, round, median } from './lib.mjs';

const argv = process.argv.slice(2);
const [video, outPath] = argv;
if (!video || !outPath) { console.error('usage: node tempo.mjs <video> <out.json> [--cuts=..] [--min=70] [--max=180]'); process.exit(2); }
const opt = Object.fromEntries(argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const SR = 22050, N = 1024, HOP = 256, FR = SR / HOP;
const bpmMin = Number(opt.min ?? 70), bpmMax = Number(opt.max ?? 180);

const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', video, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'],
  { heavy: true, collectStdout: true });
const pcm = new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 4));

function fft(re, im) { // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
const frames = Math.floor((pcm.length - N) / HOP);
const flux = new Float32Array(frames), low = new Float32Array(frames), rms = new Float32Array(frames);
const lowBin = Math.round(150 / (SR / N));
let prev = new Float32Array(N / 2);
for (let f = 0; f < frames; f++) {
  const re = new Float32Array(N), im = new Float32Array(N); let e = 0;
  for (let i = 0; i < N; i++) { const s = pcm[f * HOP + i]; re[i] = s * hann[i]; e += s * s; }
  rms[f] = Math.sqrt(e / N);
  fft(re, im);
  const mag = new Float32Array(N / 2); let s = 0, sl = 0;
  for (let k = 1; k < N / 2; k++) { mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k])); const d = mag[k] - prev[k]; if (d > 0) { s += d; if (k <= lowBin) sl += d; } }
  flux[f] = s; low[f] = sl; prev = mag;
}
function detrend(x, w) { const out = new Float32Array(x.length); let acc = 0; const q = [];
  for (let i = 0; i < x.length; i++) { q.push(x[i]); acc += x[i]; if (q.length > w) acc -= q.shift(); out[i] = Math.max(0, x[i] - acc / q.length); } return out; }
const env = detrend(flux, Math.round(0.5 * FR)), envLow = detrend(low, Math.round(0.5 * FR));
const at = (x, t) => { const p = t * FR; const i = Math.floor(p); if (i < 0 || i + 1 >= x.length) return 0; return x[i] + (x[i + 1] - x[i]) * (p - i); };

// Autocorrelation candidates.
const mean = env.reduce((a, b) => a + b, 0) / env.length;
const z = env.map((v) => v - mean);
const acf = [];
for (let lag = Math.floor(FR * 60 / bpmMax); lag <= Math.ceil(FR * 60 / bpmMin); lag++) {
  let s = 0; for (let i = 0; i + lag < z.length; i++) s += z[i] * z[i + lag]; acf.push({ lag, bpm: 60 * FR / lag, v: s / (z.length - lag) });
}
const peaks = acf.filter((a, i) => i > 0 && i < acf.length - 1 && a.v > acf[i - 1].v && a.v >= acf[i + 1].v).sort((a, b) => b.v - a.v).slice(0, 5);

function comb(bpm) { const P = 60 / bpm; let best = { score: -1 };
  for (let ph = 0; ph < P; ph += 0.002) { let s = 0, n = 0; for (let t = ph; t < pcm.length / SR; t += P) { s += at(env, t); n++; } if (s / n > best.score) best = { score: s / n, phase: ph }; }
  return best; }
const refined = peaks.map((p) => { let best = { score: -1 };
  for (let b = p.bpm * 0.97; b <= p.bpm * 1.03; b += 0.05) { const c = comb(b); if (c.score > best.score) best = { bpm: b, ...c }; }
  return { acfBpm: round(p.bpm, 2), acf: round(p.v, 4), bpm: round(best.bpm, 2), phase: round(best.phase, 3), combScore: round(best.score, 3) }; });
const envMean = env.reduce((a, b) => a + b, 0) / env.length;
// Choose the ACF winner; report the others so a reader can see half/double-time alternatives.
const pick = refined[0];
const P = 60 / pick.bpm;
const dur = pcm.length / SR;
const beats = []; for (let t = pick.phase; t < dur; t += P) beats.push(t);
const barScore = [0, 1, 2, 3].map((m) => beats.filter((_, i) => i % 4 === m).reduce((s, t) => s + at(envLow, t), 0));
const barPhaseIndex = barScore.indexOf(Math.max(...barScore));

const cuts = opt.cuts ? opt.cuts.split(',').map(Number) : [];
const cutInfo = cuts.map((c) => {
  const k = Math.round((c - pick.phase) / P); const off = c - (pick.phase + k * P);
  const kh = Math.round((c - pick.phase) / (P / 2)); const offHalf = c - (pick.phase + kh * P / 2);
  return { t: c, beatIndex: k, offsetMs: Math.round(off * 1000), halfBeatOffsetMs: Math.round(offHalf * 1000), beatInBar: ((k - barPhaseIndex) % 4 + 4) % 4 };
});
const absOff = cutInfo.map((c) => Math.abs(c.offsetMs));
const tol = 0.15 * P * 1000; // within 15% of a beat counts as on-beat
const onBeat = cutInfo.filter((c) => Math.abs(c.offsetMs) <= tol);
// Expected median |offset| for cuts placed at random: P/4.
const summary = cuts.length ? {
  medianAbsOffsetMs: median(absOff), randomExpectationMs: Math.round(P * 250), onBeatToleranceMs: Math.round(tol),
  onBeatShare: round(onBeat.length / cuts.length, 2),
  onBeatEvenShare: onBeat.length ? round(onBeat.filter((c) => c.beatIndex % 2 === 0).length / onBeat.length, 2) : null,
  onBarLineShare: onBeat.length ? round(onBeat.filter((c) => c.beatInBar === 0).length / onBeat.length, 2) : null,
  beatGapsBetweenOnBeatCuts: onBeat.slice(1).map((c, i) => c.beatIndex - onBeat[i].beatIndex),
  medianAbsHalfBeatOffsetMs: median(cutInfo.map((c) => Math.abs(c.halfBeatOffsetMs))),
} : null;
// Strong onsets (local maxima above mean + 1.5 sd within +-60 ms) for manual checking of the grid.
const sd = Math.sqrt(env.reduce((a, v) => a + (v - envMean) ** 2, 0) / env.length);
const onsets = [];
for (let i = 1; i < env.length - 1; i++) { const w = Math.round(0.06 * FR); let isMax = true;
  for (let j = Math.max(0, i - w); j <= Math.min(env.length - 1, i + w); j++) if (env[j] > env[i]) { isMax = false; break; }
  if (isMax && env[i] > envMean + 1.5 * sd) onsets.push([round(i / FR, 3), round(env[i] / sd, 1), round(envLow[i], 1)]); }
// Local tempo: ACF peak (with comb refinement) in 12 s windows, 6 s hop, to expose tempo changes.
const localTempo = [];
for (let w0 = 0; w0 + 12 <= dur + 0.01; w0 += 6) {
  const a = Math.floor(w0 * FR), b = Math.min(env.length, Math.floor((w0 + 12) * FR)); const seg = env.slice(a, b);
  const m = seg.reduce((x, y) => x + y, 0) / seg.length; let best = { v: -Infinity };
  for (let lag = Math.floor(FR * 60 / bpmMax); lag <= Math.ceil(FR * 60 / bpmMin); lag++) {
    let s2 = 0; for (let i = 0; i + lag < seg.length; i++) s2 += (seg[i] - m) * (seg[i + lag] - m);
    s2 /= (seg.length - lag); if (s2 > best.v) best = { v: s2, bpm: 60 * FR / lag }; }
  localTempo.push({ from: w0, to: w0 + 12, bpm: round(best.bpm, 1) });
}
const out = { video, localTempo, onsets, sampleRate: SR, hopSec: round(1 / FR, 5), bpm: pick.bpm, beatPeriodSec: round(P, 4), beatOffsetSec: pick.phase,
  barPhaseBeatIndex: barPhaseIndex, firstDownbeatSec: round(pick.phase + barPhaseIndex * P, 3), barLowBandScores: barScore.map((v) => round(v, 2)),
  candidates: refined, onsetEnvMean: round(envMean, 3), cuts: cutInfo, cutSummary: summary };
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ bpm: out.bpm, beatOffsetSec: out.beatOffsetSec, firstDownbeatSec: out.firstDownbeatSec, candidates: refined, cutSummary: summary }, null, 1));
