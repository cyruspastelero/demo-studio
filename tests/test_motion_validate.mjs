// Launch-ad engine (motion/): run with node tests/test_motion_validate.mjs (node:test, no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateStoryboard, validateStyle, repetitionWarnings } from '../motion/lib/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, '../motion/schema/storyboard.schema.json'), 'utf8'));
const styleSchema = JSON.parse(readFileSync(join(here, '../motion/schema/style.schema.json'), 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'motion-test-'));
writeFileSync(join(dir, 'shot.png'), 'x');
const boardPath = join(dir, 'board.json');
const base = () => ({ version: 1, brand: { name: 'Acme', accent: '#2255ff' }, scenes: [{ type: 'kineticText', duration: 2, phrases: ['Hello *world*'] }] });

test('a minimal storyboard is valid', () => {
  assert.deepEqual(validateStoryboard(base(), schema, boardPath), []);
});

test('errors name the scene index and field', () => {
  const b = base();
  b.scenes.push({ type: 'tiles', duration: 2, labels: ['only one'] });
  const errors = validateStoryboard(b, schema, boardPath);
  assert.ok(errors.some((e) => e.startsWith('scenes[1].labels') && /at least 2/.test(e)), errors.join('\n'));
});

test('unknown scene types and unknown fields are rejected', () => {
  const b = base();
  b.scenes.push({ type: 'hologram', duration: 1 });
  b.scenes[0].colour = 'red';
  const errors = validateStoryboard(b, schema, boardPath);
  assert.ok(errors.some((e) => e.startsWith('scenes[1].type')), errors.join('\n'));
  assert.ok(errors.some((e) => e.startsWith('scenes[0].colour') && /not a known field/.test(e)), errors.join('\n'));
});

test('missing asset files fail validation before rendering', () => {
  const b = base();
  b.scenes.push({ type: 'tiltedPanel', duration: 2, media: 'nope.png' });
  b.scenes.push({ type: 'tiltedPanel', duration: 2, media: { src: 'gone.mp4', from: 1 } });
  b.scenes.push({ type: 'tiltedPanel', duration: 2, media: 'shot.png' });
  const errors = validateStoryboard(b, schema, boardPath);
  assert.ok(errors.some((e) => e.startsWith('scenes[1].media') && /file not found: nope.png/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => e.startsWith('scenes[2].media.src') && /file not found: gone.mp4/.test(e)), errors.join('\n'));
  assert.ok(!errors.some((e) => e.startsWith('scenes[3]')), errors.join('\n'));
});

test('beats need a tempo; beats and duration together are rejected', () => {
  const b = base();
  b.scenes[0] = { type: 'kineticText', beats: 4, duration: 2, phrases: ['Hi'] };
  const errors = validateStoryboard(b, schema, boardPath);
  assert.ok(errors.some((e) => /needs timing.bpm/.test(e)));
  assert.ok(errors.some((e) => /not both/.test(e)));
});

test('brand accent must be a hex colour', () => {
  const b = base();
  b.brand.accent = 'orange';
  assert.ok(validateStoryboard(b, schema, boardPath).some((e) => e.startsWith('brand.accent')));
});

test('aspectMorph needs media or medias', () => {
  const b = base();
  b.scenes.push({ type: 'aspectMorph', duration: 2, ratios: ['16:9', '9:16'] });
  assert.ok(validateStoryboard(b, schema, boardPath).some((e) => e.startsWith('scenes[1]') && /media or medias/.test(e)));
});

test('every shipped style passes the style schema', () => {
  for (const name of ['airy', 'nocturne', 'showroom']) {
    const style = JSON.parse(readFileSync(join(here, `../motion-templates/${name}/style.json`), 'utf8'));
    assert.deepEqual(validateStyle(style, styleSchema), [], name);
  }
});

test('a style with a bad transition is rejected with its path', () => {
  const style = JSON.parse(readFileSync(join(here, '../motion-templates/airy/style.json'), 'utf8'));
  style.motion.transition = 'spin';
  assert.ok(validateStyle(style, styleSchema).some((e) => e.startsWith('motion.transition')));
});

test('the shipped example storyboards are valid and all their files exist', () => {
  for (const rel of ['../examples/launch-ad/storyboard.json', '../examples/motion-gallery/storyboard.json', '../examples/motion-gallery/long-headline.json']) {
    const path = join(here, rel);
    const board = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(validateStoryboard(board, schema, path), [], rel);
  }
});

test('$defs.common is a real schema (properties), not a bare property map', () => {
  const common = schema.$defs.common;
  assert.equal(typeof common.properties, 'object');
  for (const key of ['type', 'beats', 'duration', 'exit', 'tone', 'sfx', 'id', 'note']) assert.ok(key in common.properties, key);
  assert.ok(!('beats' in common));
  const b = base();
  Object.assign(b.scenes[0], { id: 'intro', note: 'n', exit: 'cut', tone: 'dark', sfx: false });
  assert.deepEqual(validateStoryboard(b, schema, boardPath), []);
});

import { request } from 'node:http';
import { mkdirSync } from 'node:fs';
import { startServer, fileUrl } from '../motion/lib/server.mjs';

const get = (port, path, host = `127.0.0.1:${port}`) => new Promise((ok, fail) => {
  const req = request({ host: '127.0.0.1', port, path, headers: { host } }, (res) => { res.resume(); res.on('end', () => ok(res.statusCode)); });
  req.on('error', fail);
  req.end();
});

test('media in folders with spaces, #, ? or % are served; bad escapes get 400; foreign hosts get 403', async () => {
  const folder = join(dir, 'my takes #1 ?50%');
  mkdirSync(folder, { recursive: true });
  const file = join(folder, 'shot 1.png');
  writeFileSync(file, 'x');
  assert.ok(!/[ #?]/.test(fileUrl(file)), fileUrl(file));
  const { server, port } = await startServer(join(here, '../motion'), new Set([folder]));
  try {
    assert.equal(await get(port, fileUrl(file)), 200);
    assert.equal(await get(port, fileUrl(file), `localhost:${port}`), 200);
    assert.equal(await get(port, '/file/%E0%A4%A'), 400);
    assert.equal(await get(port, fileUrl(file), `evil.example:${port}`), 403);
  } finally {
    server.close();
  }
});

const scenesOf = (types, extra = {}) => ({ ...base(), scenes: types.map((type) => ({ type, duration: 2, ...extra })) });

test('three scenes in a row of one type are warned about, with their indexes', () => {
  const warnings = repetitionWarnings(scenesOf(['kineticText', 'tiles', 'tiles', 'tiles', 'kineticText']));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /scenes\[1\] to scenes\[3\]/);
  assert.match(warnings[0], /tiles/);
});

test('two in a row, or the same type split by another, is not warned about', () => {
  assert.deepEqual(repetitionWarnings(scenesOf(['tiles', 'tiles', 'kineticText', 'tiles', 'tiles'])), []);
});

test('a longer run is one warning, not one per window', () => {
  assert.equal(repetitionWarnings(scenesOf(['tiles', 'tiles', 'tiles', 'tiles', 'tiles'])).length, 1);
});

test('three scenes with the same non-default exit are warned about', () => {
  const b = scenesOf(['kineticText', 'tiles', 'tiltedPanel'], { exit: 'whip' });
  const warnings = repetitionWarnings(b);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /exit "whip"/);
});

test('the default exit (absent or auto) repeated is not warned about', () => {
  const b = scenesOf(['kineticText', 'tiles', 'tiltedPanel']);
  b.scenes[1].exit = 'auto';
  assert.deepEqual(repetitionWarnings(b), []);
});

test('a board with no scenes array gives no warnings', () => {
  assert.deepEqual(repetitionWarnings({}), []);
});

test('a scene can place extra sound cues by name', () => {
  const b = base();
  b.scenes[0].cues = [{ at: 0.4, name: 'scroll' }, { at: 1.2, name: 'success', gain: -3 }];
  b.audio = { sfxKit: 'synth' };
  assert.deepEqual(validateStoryboard(b, schema, boardPath), []);
});

test('an unknown cue name or kit is rejected', () => {
  const b = base();
  b.scenes[0].cues = [{ at: 0.4, name: 'kaboom' }];
  b.audio = { sfxKit: 'mp3' };
  const errors = validateStoryboard(b, schema, boardPath);
  assert.ok(errors.some((e) => e.startsWith('scenes[0].cues[0].name')), errors.join('\n'));
  assert.ok(errors.some((e) => e.startsWith('audio.sfxKit')), errors.join('\n'));
});

test('every cue name has a sound and every recorded sound has a listed source', () => {
  const kitDir = join(here, '../motion/sfx-kit');
  const recorded = readdirSync(kitDir).filter((f) => f.endsWith('.wav')).map((f) => f.slice(0, -4));
  const synth = ['whoosh', 'swish', 'click', 'tick', 'pop', 'hit', 'sparkle', 'typing'];
  for (const name of schema.$defs.cueName.enum) assert.ok(recorded.includes(name) || synth.includes(name), `no sound for cue ${name}`);
  const sources = readFileSync(join(kitDir, 'SOURCES.md'), 'utf8');
  for (const name of recorded) assert.match(sources, new RegExp(`^\\| \`${name}\` \\|`, 'm'), `${name}.wav has no row in SOURCES.md`);
});
