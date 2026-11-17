// Behaviour of scripts/lib.js helpers that can be checked without a browser.
// Run: node tests/test_lib.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = readFileSync(fileURLToPath(new URL('../scripts/lib.js', import.meta.url)), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

// lib.js is a fragment that scenes are wrapped around; give it the two names it expects.
async function loadLib(project) {
  const recordingContext = { request: {}, pages: () => [], addInitScript: async () => {} };
  const mcpContext = { browser: () => ({ contexts: () => [mcpContext, recordingContext] }) };
  const page = { context: () => mcpContext };
  return new AsyncFunction('page', 'PROJECT', `${SOURCE}\nreturn { hideClutter, prep, scoutRects, CURSOR_STYLE };`)(page, project);
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

console.log(`\nlib tests passed (${passed})`);
