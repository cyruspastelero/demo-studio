// Beat analysis: onset envelope (spectral flux), tempo (autocorrelation) and beat phase.
// Pure functions over a mono Float32Array; no I/O here so they can be tested.

export const HOP = 256;
export const FFT_SIZE = 1024;
/** Flux peaks when an onset sits mid-window, so frame times lead the sound by half a window. */
const LATENCY_FRAMES = FFT_SIZE / 2 / HOP;

function fftMagnitudes(frame) {
  const n = frame.length;
  const re = Float64Array.from(frame);
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(angle * k), wi = Math.sin(angle * k);
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const tr = ar * wr - ai * wi, ti = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k] - tr; im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr; im[i + k] += ti;
      }
    }
  }
  const mags = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mags[i] = Math.log1p(100 * Math.hypot(re[i], im[i]));
  return mags;
}

/** Spectral-flux onset envelope, one value per HOP samples, normalised to 0..1. */
export function onsetEnvelope(samples) {
  const window = new Float64Array(FFT_SIZE).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE));
  const frames = Math.max(0, Math.floor((samples.length - FFT_SIZE) / HOP));
  const env = new Float64Array(frames);
  let prev = null;
  for (let f = 0; f < frames; f++) {
    const frame = new Float64Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) frame[i] = samples[f * HOP + i] * window[i];
    const mags = fftMagnitudes(frame);
    if (prev) {
      let flux = 0;
      for (let i = 0; i < mags.length; i++) flux += Math.max(0, mags[i] - prev[i]);
      env[f] = flux;
    }
    prev = mags;
  }
  const max = env.reduce((m, v) => Math.max(m, v), 0) || 1;
  return env.map((v) => v / max);
}

/** Tempo in BPM from an onset envelope, searching minBpm..maxBpm, mildly preferring ~120. */
export function estimateTempo(env, sampleRate, { minBpm = 70, maxBpm = 180 } = {}) {
  const fps = sampleRate / HOP;
  const mean = env.reduce((s, v) => s + v, 0) / (env.length || 1);
  const centred = env.map((v) => v - mean);
  let best = { bpm: 120, score: -Infinity };
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.25) {
    const lag = (60 / bpm) * fps;
    let score = 0;
    for (let i = 0; i + lag * 2 < centred.length; i++) {
      score += centred[i] * (interp(centred, i + lag) + 0.5 * interp(centred, i + 2 * lag));
    }
    const prior = Math.exp(-0.5 * Math.log2(bpm / 120) ** 2 / 0.6 ** 2);
    score *= prior;
    if (score > best.score) best = { bpm, score };
  }
  return best.bpm;
}

function interp(arr, x) {
  const i = Math.floor(x), f = x - i;
  if (i + 1 >= arr.length) return 0;
  return arr[i] * (1 - f) + arr[i + 1] * f;
}

/** Beat phase (seconds of the first beat) for a known tempo: maximises envelope energy on the grid. */
export function beatPhase(env, sampleRate, bpm) {
  const fps = sampleRate / HOP;
  const period = (60 / bpm) * fps;
  let best = { offset: 0, score: -Infinity };
  for (let off = 0; off < period; off += 0.25) {
    let score = 0;
    for (let x = off; x < env.length; x += period) score += interp(env, x);
    if (score > best.score) best = { offset: off, score };
  }
  return (best.offset + LATENCY_FRAMES) / fps;
}

/** Strong onsets (peaks above a threshold with a minimum gap), in seconds. */
export function strongOnsets(env, sampleRate, { threshold = 0.45, minGapSec = 0.2 } = {}) {
  const fps = sampleRate / HOP;
  const out = [];
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] >= threshold && env[i] >= env[i - 1] && env[i] > env[i + 1]) {
      const t = (i + LATENCY_FRAMES) / fps;
      if (!out.length || t - out[out.length - 1] >= minGapSec) out.push(Number(t.toFixed(3)));
    }
  }
  return out;
}

/**
 * Refine tempo and phase with a least-squares fit of strong onsets to the nearest grid slot
 * (beat / division). Onsets more than `tolerance` of a slot away are ignored.
 */
export function refineTempo(onsets, bpm, offset, { division = 2, tolerance = 0.2 } = {}) {
  const step = 60 / bpm / division;
  const pts = onsets.map((t) => ({ t, k: Math.round((t - offset) / step) })).filter(({ t, k }) => Math.abs(t - offset - k * step) < tolerance * step);
  if (pts.length < 4) return { bpm, offset };
  const n = pts.length, sk = pts.reduce((s, p) => s + p.k, 0), st = pts.reduce((s, p) => s + p.t, 0);
  const skk = pts.reduce((s, p) => s + p.k * p.k, 0), skt = pts.reduce((s, p) => s + p.k * p.t, 0);
  const slope = (n * skt - sk * st) / (n * skk - sk * sk);
  const intercept = (st - slope * sk) / n;
  const beat = slope * division;
  const phase = ((intercept % beat) + beat) % beat;
  return { bpm: 60 / beat, offset: phase };
}

export function analyse(samples, sampleRate) {
  const env = onsetEnvelope(samples);
  const coarse = estimateTempo(env, sampleRate);
  const onsets = strongOnsets(env, sampleRate);
  const refined = refineTempo(onsets, coarse, beatPhase(env, sampleRate, coarse));
  return { bpm: Number(refined.bpm.toFixed(3)), offset: Number(refined.offset.toFixed(4)), onsets };
}
