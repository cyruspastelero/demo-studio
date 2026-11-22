#!/usr/bin/env node
// Usage: node analyze-beats.mjs <music file> [--out beats.json]
// Decodes the track with ffmpeg and writes {bpm, offset, onsets[], duration} for storyboard timing.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { analyse } from './lib/beats.mjs';

const SAMPLE_RATE = 22050;

export function decodeMono(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

export function analyseFile(file) {
  const samples = decodeMono(file);
  const result = analyse(samples, SAMPLE_RATE);
  return { file, duration: Number((samples.length / SAMPLE_RATE).toFixed(3)), ...result };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node analyze-beats.mjs <music file> [--out beats.json]'); process.exit(2); }
  const outIndex = process.argv.indexOf('--out');
  const result = analyseFile(file);
  const json = JSON.stringify(result, null, 2);
  if (outIndex > 0) writeFileSync(process.argv[outIndex + 1], json + '\n');
  console.log(JSON.stringify({ bpm: result.bpm, offset: result.offset, onsets: result.onsets.length, duration: result.duration }));
}
