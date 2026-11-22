// Launch-ad engine (motion/): run with node tests/test_motion_timing.mjs (node:test, no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveScenes, snapToBeat, beatSteps, totalDuration } from '../motion/lib/timing.mjs';
import { cubicBezier, ease } from '../motion/lib/easing.mjs';

test('scenes in beats start on the beat grid at 120 bpm', () => {
  const t = resolveScenes([{ beats: 8 }, { beats: 4 }, { beats: 3 }], { bpm: 120, offset: 0 }, 30);
  assert.deepEqual(t.map((s) => [s.start, s.end]), [[0, 4], [4, 6], [6, 7.5]]);
  assert.equal(totalDuration(t, 0.5), 8);
});

test('the first scene starts on the first beat offset unless start is given', () => {
  const a = resolveScenes([{ beats: 2 }], { bpm: 100, offset: 0.25 }, 30);
  assert.ok(Math.abs(a[0].start - 0.25) <= 1 / 60, String(a[0].start));
  const b = resolveScenes([{ beats: 2 }], { bpm: 100, offset: 0.25, start: 0 }, 30);
  assert.equal(b[0].start, 0);
});

test('scene times land on whole frames and never drift from the beat grid by more than half a frame', () => {
  const scenes = Array.from({ length: 40 }, () => ({ beats: 1 }));
  const t = resolveScenes(scenes, { bpm: 119.999, offset: 0, start: 0 }, 30);
  for (const s of t) {
    assert.ok(Math.abs(s.start * 30 - Math.round(s.start * 30)) < 1e-6);
  }
  const beat = 60 / 119.999;
  assert.ok(Math.abs(t[39].end - 40 * beat) <= 1 / 60 + 1e-9);
});

test('seconds and beats can be mixed; beats without bpm is an error', () => {
  const t = resolveScenes([{ duration: 1.5 }, { beats: 2 }], { bpm: 60 }, 30);
  assert.deepEqual(t.map((s) => s.end), [1.5, 3.5]);
  assert.throws(() => resolveScenes([{ beats: 2 }], {}, 30), /needs timing.bpm/);
  assert.throws(() => resolveScenes([{}], { bpm: 120 }, 30), /needs "beats" or "duration"/);
});

test('snapToBeat finds the nearest beat or subdivision', () => {
  assert.equal(snapToBeat(1.26, { bpm: 120 }), 1.5);
  assert.equal(snapToBeat(1.2, { bpm: 120 }), 1.0);
  assert.equal(snapToBeat(1.2, { bpm: 120, division: 4 }), 1.25);
  assert.equal(snapToBeat(0.1, { bpm: 120, offset: 0.3 }), 0.3);
});

test('beatSteps spreads items one per beat', () => {
  assert.deepEqual(beatSteps(3, { bpm: 120, every: 2, startBeat: 1 }), [0.5, 1.5, 2.5]);
});

test('cubic-bezier matches its endpoints and CSS ease-out shape', () => {
  const f = cubicBezier(0.22, 1, 0.36, 1);
  assert.equal(f(0), 0);
  assert.equal(f(1), 1);
  assert.ok(f(0.25) > 0.6, 'ease-out is past halfway early');
  const lin = ease('linear');
  assert.ok(Math.abs(lin(0.37) - 0.37) < 1e-4);
  assert.throws(() => ease('wobble'), /unknown easing/);
});
