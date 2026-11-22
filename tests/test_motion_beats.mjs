// Launch-ad engine (motion/): run with node tests/test_motion_beats.mjs (node:test, no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse, refineTempo } from '../motion/lib/beats.mjs';

const SR = 22050;
function clickTrack(bpm, seconds, offset = 0) {
  const s = new Float32Array(SR * seconds);
  const beat = 60 / bpm;
  for (let t = offset; t < seconds; t += beat) {
    const i0 = Math.round(t * SR);
    for (let i = 0; i < 400 && i0 + i < s.length; i++) s[i0 + i] = Math.sin(i * 0.9) * Math.exp(-i / 60);
  }
  return s;
}

test('finds the tempo of a 120 bpm click track', () => {
  const r = analyse(clickTrack(120, 12), SR);
  assert.ok(Math.abs(r.bpm - 120) < 0.5, String(r.bpm));
});

test('finds the tempo of a 96 bpm click track with an offset and its phase', () => {
  const r = analyse(clickTrack(96, 15, 0.2), SR);
  assert.ok(Math.abs(r.bpm - 96) < 0.5, String(r.bpm));
  const beat = 60 / r.bpm;
  const phaseErr = Math.min(Math.abs(r.offset - 0.2), Math.abs(r.offset - 0.2 - beat), Math.abs(r.offset + beat - 0.2));
  assert.ok(phaseErr < 0.03, `offset ${r.offset}`);
});

test('refineTempo corrects a slightly wrong coarse tempo from onsets', () => {
  const onsets = Array.from({ length: 60 }, (_, k) => 0.1 + k * 0.5);
  const r = refineTempo(onsets, 120.25, 0.1);
  assert.ok(Math.abs(r.bpm - 120) < 0.01, String(r.bpm));
});

import { buildMixGraph } from '../motion/lib/mix.mjs';

test('a mix without music starts with a silent bed as long as the ad', () => {
  const g = buildMixGraph({ duration: 29.2, cues: [{ t: 1, name: 'pop' }, { t: 2, name: 'pop' }], sfx: { pop: 'pop.wav' } });
  assert.equal(g.inputs.slice(0, 6).join(' '), '-f lavfi -t 29.200 -i anullsrc=r=48000:cl=stereo');
  assert.match(g.filter, /^\[0:a\]anull\[m\]/);
  assert.match(g.filter, /\[1:a\].*adelay=1000\|1000/);
  assert.match(g.filter, /amix=inputs=3:normalize=0:duration=first,atrim=duration=29\.200/);
});

test('with music, SFX inputs are numbered after it and cues outside the window are dropped', () => {
  const g = buildMixGraph({ music: 'm.mp3', duration: 10, window: [2, 6], cues: [{ t: 1, name: 'tick' }, { t: 3, name: 'tick' }, { t: 4, name: 'nope' }], sfx: { tick: 't.wav' } });
  assert.deepEqual(g.inputs, ['-i', 'm.mp3', '-i', 't.wav']);
  assert.match(g.filter, /\[1:a\].*adelay=1000\|1000/);
  assert.deepEqual(g.missing, ['nope']);
});
