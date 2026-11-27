// Launch-ad engine (motion/): run with node tests/test_motion_fit.mjs (node:test, no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitText, wrap, parseAccent } from '../motion/lib/fit.mjs';

// Monospace stand-in: every character is 0.5 em wide.
const measure = (text, size) => text.length * size * 0.5;
const words = (s) => s.split(' ');

test('short headline keeps the base size on one line', () => {
  const r = fitText(words('Fix anything.'), measure, { baseSize: 100, minSize: 44, maxWidth: 1000 });
  assert.equal(r.size, 100);
  assert.equal(r.lines.length, 1);
  assert.equal(r.overflow, false);
});

test('long headline wraps within maxLines and every line fits the width', () => {
  const r = fitText(words('Every demo video took me an afternoon and most of the evening too'), measure, { baseSize: 100, minSize: 44, maxWidth: 900, maxLines: 3 });
  assert.ok(r.lines.length <= 3);
  for (const line of r.lines) assert.ok(measure(line.join(' '), r.size) <= 900, line.join(' '));
  assert.equal(r.overflow, false);
});

test('a single very long word shrinks instead of clipping', () => {
  const r = fitText(['Supercalifragilisticexpialidocious'], measure, { baseSize: 120, minSize: 20, maxWidth: 600, maxLines: 1 });
  assert.ok(measure('Supercalifragilisticexpialidocious', r.size) <= 600);
  assert.ok(r.size < 120);
});

test('text that cannot fit at the minimum size reports overflow', () => {
  const r = fitText(['Supercalifragilisticexpialidocious'], measure, { baseSize: 120, minSize: 60, maxWidth: 300, maxLines: 1 });
  assert.equal(r.overflow, true);
  assert.equal(r.size, 60);
});

test('phrase groups break between phrases, not inside them', () => {
  const w = words('Free. Local. Open source.');
  const r = fitText(w, measure, { baseSize: 100, minSize: 44, maxWidth: 650, groups: [1, 1, 2] });
  assert.deepEqual(r.lines.map((l) => l.join(' ')), ['Free. Local.', 'Open source.']);
});

test('lines are balanced instead of leaving an orphan word', () => {
  const r = fitText(words('I make demos for my own apps'), measure, { baseSize: 100, minSize: 44, maxWidth: 1200 });
  assert.equal(r.lines.length, 2);
  const lengths = r.lines.map((l) => l.join(' ').length);
  assert.ok(Math.abs(lengths[0] - lengths[1]) <= 6, String(lengths));
});

test('wrap puts a word wider than the line on its own line', () => {
  assert.deepEqual(wrap(['a', 'loooooooong', 'b'], measure, 10, 30).map((l) => l.join(' ')), ['a', 'loooooooong', 'b']);
});

test('asterisks mark accent words, including across words and before punctuation', () => {
  const parsed = parseAccent('Every *demo video* took *me*.');
  assert.deepEqual(parsed.map((w) => [w.text, w.accent]), [['Every', false], ['demo', true], ['video', true], ['took', false], ['me.', true]]);
});

test('more lines than maxLines at the minimum size reports overflow', () => {
  const r = fitText(words('Acme Super Long Brand Name Here'), measure, { baseSize: 100, minSize: 40, maxWidth: 400, maxLines: 1 });
  assert.ok(r.lines.length > 1);
  assert.equal(r.overflow, true);
});
