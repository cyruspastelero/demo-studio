// Behaviour of scripts/lib.js helpers that can be checked without a browser.
// Run: node tests/test_lib.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = readFileSync(fileURLToPath(new URL('../scripts/lib.js', import.meta.url)), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

// lib.js is a fragment that scenes are wrapped around; give it the two names it expects.
async function loadLib(project, recording = {}) {
  const recordingContext = { request: {}, pages: () => [], addInitScript: async () => {}, ...recording };
  const mcpContext = { browser: () => ({ contexts: () => [mcpContext, recordingContext] }) };
  const page = { context: () => mcpContext };
  return new AsyncFunction('page', 'PROJECT', `${SOURCE}\nreturn { hideClutter, prep, record, scoutRects, CURSOR_STYLE, MASK_CFG };`)(page, project);
}

// The page-side mask builds these two regexes from MASK_CFG (see MASK_FN in lib.js).
const labelRegex = (cfg) => new RegExp(`^(${cfg.labels.join('|')})$`, 'i');
const tokenRegex = (cfg) => new RegExp(cfg.tokens.join('|'));

// A receiver that answers /frame with the given replies in turn, and a CDP session the test drives.
function fakeRecorder(frameReplies) {
  const posts = [];
  const reply = (status, text) => ({ ok: () => status < 300, status: () => status, text: async () => text,
    json: async () => JSON.parse(text) });
  const request = {
    post: async (url, options) => {
      posts.push(url);
      if (url.endsWith('/frame')) {
        const next = frameReplies.shift();
        if (next instanceof Error) throw next;
        return reply(...next);
      }
      return url.endsWith('/stop') ? reply(200, '{"frames":1}') : reply(200, 'ok');
    },
  };
  let onFrame = null;
  const cdp = { on: (name, fn) => { onFrame = fn; }, send: async () => {}, detach: async () => {} };
  const tab = { evaluate: async () => [1440, 810, 2] };
  const emit = (ts) => onFrame({ sessionId: 1, data: 'x', metadata: { timestamp: ts } });
  return { posts, tab, emit, recording: { request, newCDPSession: async () => cdp } };
}

function fakeTab() {
  const calls = [];
  return {
    calls,
    bringToFront: async () => {},
    setViewportSize: async () => {},
    evaluate: async (fn, arg) => { calls.push(arg); },
  };
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

await test('an empty clutter list hides nothing (an empty pattern would match every element)', async () => {
  const { hideClutter } = await loadLib({});
  const tab = fakeTab();
  await hideClutter(tab, []);
  await hideClutter(tab, ['', '   ']);
  assert.equal(tab.calls.length, 0);
});

await test('clutter patterns are passed to the page, without blank entries', async () => {
  const { hideClutter } = await loadLib({});
  const tab = fakeTab();
  await hideClutter(tab, ['Enable notifications', '', 'Accept cookies']);
  assert.deepEqual(tab.calls, [['Enable notifications', 'Accept cookies']]);
});

await test('prep with the template project (clutter: []) never runs the clutter pass', async () => {
  const { prep } = await loadLib({ clutter: [] });
  const tab = fakeTab();
  await prep(tab);
  assert.equal(tab.calls.some((arg) => Array.isArray(arg)), false);
});

await test('scout rects are converted from CSS px to source px of the 1080p take (x 4/3)', async () => {
  const { scoutRects } = await loadLib({});
  const loc = { boundingBox: async () => ({ x: 300, y: 150, width: 90, height: 24 }) };
  const out = await scoutRects({}, { button: loc });
  assert.deepEqual(out.button.rect, [400, 200, 120, 32]);
  assert.deepEqual(out.button.focus, [460, 216]);
  assert.equal(out.button.t, null);
});

await test('a scout target that is not visible stops with its name', async () => {
  const { scoutRects } = await loadLib({});
  await assert.rejects(scoutRects({}, { missing: { boundingBox: async () => null } }), /missing is not visible/);
});

await test('the default cursor is the pointing hand, never a dot', async () => {
  const { CURSOR_STYLE } = await loadLib({});
  assert.equal(CURSOR_STYLE, 'hand');
  assert.doesNotMatch(SOURCE, /#8FAFF5|ripple/);
});

await test('mask labels are literal text: regex characters neither throw nor stop the label matching itself', async () => {
  const { MASK_CFG } = await loadLib({ maskLabels: ['Key **', 'Secret key (live)', 'a.b'] });
  const labels = labelRegex(MASK_CFG);
  assert.ok(labels.test('Key **'));
  assert.ok(labels.test('Secret key (live)'));
  assert.equal(labels.test('axb'), false);
});

await test('blank mask patterns and labels are dropped (an empty one would blur every text node)', async () => {
  const { MASK_CFG } = await loadLib({ maskPatterns: ['', '  '], maskLabels: [''] });
  assert.equal(tokenRegex(MASK_CFG).test('just some words'), false);
  assert.equal(labelRegex(MASK_CFG).test(''), false);
  assert.ok(tokenRegex(MASK_CFG).test('ghp_abcdefghijklmnopqrstuvwxyz'));
});

await test('a mask pattern that is not a valid regex stops before recording and names the pattern', async () => {
  await assert.rejects(loadLib({ maskPatterns: ['wf_(live'] }), /maskPatterns.*wf_\(live/);
});

await test('prep surfaces a masking failure instead of recording unmasked', async () => {
  const { prep } = await loadLib({});
  const tab = { ...fakeTab(), evaluate: async () => { throw new Error('page crashed'); } };
  await assert.rejects(prep(tab), /page crashed/);
});

await test('the init script reports a masking failure on the console and keeps cursor and mask apart', async () => {
  let script = '';
  await loadLib({}, { addInitScript: async ({ content }) => { script = content; } });
  assert.match(script, /console\.error\('\[demo-studio\] masking/);
  assert.doesNotMatch(script, /catch \(e\) \{\}/);
});

await test('stop() throws with the count and first reason when frame posts were refused or failed', async () => {
  const rig = fakeRecorder([[200, 'ok'], [507, 'disk full'], [200, 'full'], new Error('socket hang up'), [200, 'skip']]);
  const { record } = await loadLib({ rxToken: 't' }, rig.recording);
  const stop = await record(rig.tab, 'a-t1');
  for (let i = 0; i < 5; i += 1) rig.emit(1000 + i);
  await assert.rejects(stop(), /3 frames? .*dropped.*507.*disk full/);
  assert.ok(rig.posts.at(-1).endsWith('/stop'), 'the receiver is still told to stop');
});

await test('stop() returns the receiver summary when every frame was stored or skipped as a repeat', async () => {
  const rig = fakeRecorder([[200, 'ok'], [200, 'skip']]);
  const { record } = await loadLib({ rxToken: 't' }, rig.recording);
  const stop = await record(rig.tab, 'a-t1');
  rig.emit(1000); rig.emit(1000.01);
  assert.deepEqual(await stop(), { frames: 1 });
});

console.log(`\nlib tests passed (${passed})`);
