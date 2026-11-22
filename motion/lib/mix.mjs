// Audio: music bed + SFX cues -> one track, then two-pass EBU R128 loudnorm.
import { spawnSync } from 'node:child_process';

/**
 * Builds the filter graph. cues: [{t, name, gain}]; sfx: {name: path}. Returns {inputs, filter}.
 * Cues without a matching SFX file are skipped (listed in `missing`).
 */
export function buildMixGraph({ music, musicStart = 0, musicGainDb = 0, duration, fadeOut = 1.5, cues = [], sfx = {}, sfxGainDb = -10, window = [0, duration] }) {
  const inputs = [];
  const parts = [];
  const labels = [];
  const missing = new Set();
  const [from, to] = window;
  const len = to - from;
  if (music) {
    inputs.push('-i', music);
    const fadeStart = Math.max(0, Math.min(len, duration - from) - fadeOut);
    parts.push(`[0:a]atrim=start=${(musicStart + from).toFixed(3)}:duration=${len.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume=${musicGainDb}dB,afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeOut}[m]`);
    labels.push('[m]');
  } else {
    // No music: a silent bed of the full length comes first, so amix (duration=first) and
    // -shortest keep the whole video instead of stopping at the first SFX.
    inputs.push('-f', 'lavfi', '-t', len.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
    parts.push('[0:a]anull[m]');
    labels.push('[m]');
  }
  const used = cues.filter((c) => c.t >= from - 0.05 && c.t < to);
  const fileIndex = new Map();
  for (const c of used) {
    if (!sfx[c.name]) { missing.add(c.name); continue; }
    if (!fileIndex.has(c.name)) { fileIndex.set(c.name, inputs.filter((x) => x === '-i').length); inputs.push('-i', sfx[c.name]); }
  }
  used.filter((c) => sfx[c.name]).forEach((c, i) => {
    const delay = Math.max(0, Math.round((c.t - from) * 1000));
    parts.push(`[${fileIndex.get(c.name)}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${sfxGainDb + (c.gain || 0)}dB,adelay=${delay}|${delay}[s${i}]`);
    labels.push(`[s${i}]`);
  });
  parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first,atrim=duration=${len.toFixed(3)}[mix]`);
  return { inputs, filter: parts.join(';'), missing: [...missing] };
}

function ff(args, what) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${what} failed: ${(r.stderr || '').slice(-600)}`);
  return r.stderr || '';
}

function lastJson(text) {
  const m = text.match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!m) throw new Error('loudnorm: no measurement in ffmpeg output');
  return JSON.parse(m[m.length - 1]);
}

/** Render the mix to wav, then loudnorm in two passes to `outFile` (wav). Returns skipped cue names. */
export function renderMix(opts, rawFile, outFile, { loudness = -14, truePeak = -1.5 } = {}) {
  const { inputs, filter, missing } = buildMixGraph(opts);
  ff(['-y', ...inputs, '-filter_complex', filter, '-map', '[mix]', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s24le', rawFile], 'audio mix');
  const target = `I=${loudness}:TP=${truePeak}:LRA=11`;
  const m = lastJson(ff(['-i', rawFile, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-'], 'loudnorm pass 1'));
  ff(['-y', '-i', rawFile, '-af', `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`, '-ar', '48000', '-c:a', 'pcm_s24le', outFile], 'loudnorm pass 2');
  return { missing, firstPass: m };
}

/** Integrated loudness (LUFS) and true peak (dBTP) of a finished file. */
export function loudnessReport(file) {
  const text = ff(['-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], 'loudness report');
  const summary = text.slice(text.lastIndexOf('Summary:'));
  const i = summary.match(/I:\s+(-?[\d.]+) LUFS/);
  const tp = summary.match(/Peak:\s+(-?[\d.]+) dBFS/);
  return { integrated: i ? Number(i[1]) : null, truePeak: tp ? Number(tp[1]) : null };
}
