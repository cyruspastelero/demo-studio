import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// A fake child for each spawn, so no script runs and no real process group is signalled.
const children = [];
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal()),
  spawn: (cmd, args, options) => {
    const child = Object.assign(new EventEmitter(), { pid: 999999, cmd, args, options, stdout: new PassThrough(), stderr: new PassThrough() });
    children.push(child);
    return child;
  },
}));
const { RenderRunner } = await import('./render.mjs');

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'studio-render-'));
  writeFileSync(join(dir, 'demo.json'), '{}');
  children.length = 0;
  vi.spyOn(process, 'kill').mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

it('refuses a new render until the cancelled one has exited', async () => {
  const runner = new RenderRunner(() => {});
  const ctx = { repo: '/repo', folder: dir };
  runner.start('keynote', ctx);
  expect(runner.cancel()).toBe(true);
  expect(runner.state().status).toBe('cancelled');
  expect(() => runner.start('keynote', ctx)).toThrow('the previous render is still stopping');
  let exited = false;
  runner.exited().then(() => { exited = true; });
  children[0].emit('close', null, 'SIGTERM');
  await runner.exited();
  expect(exited).toBe(true);
  expect(runner.start('keynote', ctx).status).toBe('running');
  expect(children).toHaveLength(2);
});

// ---- checks after a successful render

const row = (status, item, text = `${item} text`) => ({ status, item, text });
const jsonPath = (child) => child.args[child.args.indexOf('--json') + 1];
const tool = (child) => (child.args[1].endsWith('check-cut.py') ? 'check-cut' : 'video-gate');
const nextChild = (n) => vi.waitFor(() => expect(children).toHaveLength(n));

// A checker child finishes: it writes its rows (when given) where --json says, then exits.
function endCheck(child, rows, code = 0) {
  if (rows !== undefined) writeFileSync(jsonPath(child), typeof rows === 'string' ? rows : JSON.stringify(rows));
  child.emit('close', code, null);
}

// Starts `kind`, has the script print these outputs and exit 0.
async function finishRender(runner, kind, outputs, ctx = {}) {
  runner.start(kind, { repo: '/repo', folder: dir, ...ctx });
  children[0].stdout.write(outputs.map((o) => `OUTPUT ${o}\n`).join(''));
  await vi.waitFor(() => expect(runner.state().outputs).toHaveLength(outputs.length));
  children[0].emit('close', 0, null);
}

function makeCut(name, { plan = true } = {}) {
  mkdirSync(join(dir, 'exports'), { recursive: true });
  const video = join(dir, 'exports', name);
  writeFileSync(video, '');
  if (plan) writeFileSync(video.replace(/(-narrated)?\.mp4$/, '.plan.json').replace('-narrated', ''), '{}');
  return realpathSync(video);
}

it('a successful render gets video-gate rows on its output', async () => {
  const video = makeCut('x-keynote-cut.mp4', { plan: false });
  const runner = new RenderRunner(() => {});
  await finishRender(runner, 'keynote', [video]);
  await nextChild(2);
  expect(runner.state().checking).toBe(true);
  expect(runner.state().status).toBe('running');
  expect(children[1].args.slice(0, 1)).toEqual(['-I']);
  expect(children[1].args).toContain(video);
  expect(children[1].options.cwd).toBe(dir);
  const scratch = jsonPath(children[1]);
  expect(scratch.startsWith(dir)).toBe(false);
  endCheck(children[1], [row('FAIL', 'G1'), row('PASS', 'G2')]);
  await runner.exited();
  const state = runner.state();
  expect(state.status).toBe('done');
  expect(state.checking).toBe(false);
  expect(state.checks[video]).toEqual({ checks: [{ tool: 'video-gate', rows: [row('FAIL', 'G1'), row('PASS', 'G2')] }], note: null });
  expect(existsSync(scratch)).toBe(false);
  expect(children).toHaveLength(2);
});

it('a keynote cut with a plan sidecar also gets check-cut, one at a time', async () => {
  const video = makeCut('x-keynote-cut-narrated.mp4');
  const runner = new RenderRunner(() => {});
  await finishRender(runner, 'keynote', [video]);
  await nextChild(2);
  expect(tool(children[1])).toBe('video-gate');
  await new Promise((r) => setTimeout(r, 20));
  expect(children).toHaveLength(2); // the second checker waits for the first
  endCheck(children[1], [row('PASS', 'G1')]);
  await nextChild(3);
  expect(tool(children[2])).toBe('check-cut');
  endCheck(children[2], [row('LOOK', 'A1')], 0);
  await runner.exited();
  expect(runner.state().checks[video].checks.map((c) => c.tool)).toEqual(['video-gate', 'check-cut']);
});

it('a keynote cut without a sidecar gets video-gate only', async () => {
  const video = makeCut('x-keynote-cut.mp4', { plan: false });
  const runner = new RenderRunner(() => {});
  await finishRender(runner, 'keynote', [video]);
  await nextChild(2);
  endCheck(children[1], []);
  await runner.exited();
  expect(children).toHaveLength(2);
  expect(runner.state().checks[video].checks.map((c) => c.tool)).toEqual(['video-gate']);
});

it('the quick preview is not checked: it is a timing preview with plain slates and no sound', async () => {
  const video = makeCut('x-keynote-cut.mp4');
  const runner = new RenderRunner(() => {});
  await finishRender(runner, 'quick', [video], { video: 'KEYNOTE' });
  await runner.exited();
  expect(children).toHaveLength(1);
  expect(runner.state().status).toBe('done');
  expect(runner.state().checks).toEqual({});
});

it('a crashing checker leaves the render done with a could-not-check note', async () => {
  const video = makeCut('x-keynote-cut.mp4', { plan: false });
  const runner = new RenderRunner(() => {});
  await finishRender(runner, 'keynote', [video]);
  await nextChild(2);
  children[1].stderr.write('Traceback\nValueError: bad video\n');
  await new Promise((r) => setTimeout(r, 10));
  endCheck(children[1], undefined, 2);
  await runner.exited();
  const state = runner.state();
  expect(state.status).toBe('done');
  expect(state.checks[video].note).toBe('could not check: video-gate exited with 2: ValueError: bad video');
  expect(state.log.at(-1).line).toContain('could not check');
});

it('a checker that cannot start is reported, not thrown', async () => {
  const video = makeCut('x-keynote-cut.mp4', { plan: false });
  const runner = new RenderRunner(() => {});
  await finishRender(runner, 'keynote', [video]);
  await nextChild(2);
  children[1].emit('error', new Error('spawn python3 ENOENT'));
  await runner.exited();
  expect(runner.state().status).toBe('done');
  expect(runner.state().checks[video].note).toMatch(/^could not check: could not start python3: spawn python3 ENOENT/);
});

it('a checker that hangs is stopped and reported, so the next render is not blocked', async () => {
  const video = makeCut('x-keynote-cut.mp4', { plan: false });
  const runner = new RenderRunner(() => {}, { checkTimeoutMs: 20 });
  await finishRender(runner, 'keynote', [video]);
  await nextChild(2);
  await vi.waitFor(() => expect(process.kill).toHaveBeenCalledWith(-children[1].pid, 'SIGKILL'));
  children[1].emit('close', null, 'SIGKILL');
  await runner.exited();
  expect(runner.state().status).toBe('done');
  expect(runner.state().checks[video].note).toMatch(/^could not check: video-gate took longer than .* and was stopped/);
});

it.each([
  ['not json', 'nope'],
  ['not a list', '{"status":"PASS"}'],
  ['an unknown status', JSON.stringify([row('MAYBE', 'G1')])],
  ['a row without text', JSON.stringify([{ status: 'PASS', item: 'G1' }])],
])('malformed checker output (%s) is rejected and reported', async (_name, body) => {
  const video = makeCut('x-keynote-cut.mp4', { plan: false });
  const runner = new RenderRunner(() => {});
  await finishRender(runner, 'keynote', [video]);
  await nextChild(2);
  endCheck(children[1], body);
  await runner.exited();
  const entry = runner.state().checks[video];
  expect(runner.state().status).toBe('done');
  expect(entry.checks).toEqual([]);
  expect(entry.note).toMatch(/^could not check: /);
});

it('long row text is cut down', async () => {
  const video = makeCut('x-keynote-cut.mp4', { plan: false });
  const runner = new RenderRunner(() => {});
  await finishRender(runner, 'keynote', [video]);
  await nextChild(2);
  endCheck(children[1], [row('PASS', 'G1', 'x'.repeat(5000))]);
  await runner.exited();
  expect(runner.state().checks[video].checks[0].rows[0].text).toHaveLength(300);
});

it('a failed render is not checked', async () => {
  const runner = new RenderRunner(() => {});
  runner.start('keynote', { repo: '/repo', folder: dir });
  children[0].emit('close', 1, null);
  await runner.exited();
  expect(runner.state().status).toBe('failed');
  expect(children).toHaveLength(1);
});

it('an output outside the demo folder is not checked', async () => {
  const outside = mkdtempSync(join(tmpdir(), 'studio-outside-'));
  writeFileSync(join(outside, 'o.mp4'), '');
  const runner = new RenderRunner(() => {});
  await finishRender(runner, 'keynote', [join(outside, 'o.mp4')]);
  await runner.exited();
  rmSync(outside, { recursive: true, force: true });
  expect(runner.state().status).toBe('done');
  expect(children).toHaveLength(1);
});

it('cancel stops a running check and the render stays cancelled', async () => {
  const video = makeCut('x-keynote-cut.mp4', { plan: true });
  const runner = new RenderRunner(() => {});
  await finishRender(runner, 'keynote', [video]);
  await nextChild(2);
  expect(runner.cancel()).toBe(true);
  expect(process.kill).toHaveBeenCalledWith(-children[1].pid, 'SIGTERM');
  expect(runner.state().checking).toBe(false);
  expect(() => runner.start('keynote', { repo: '/repo', folder: dir })).toThrow('still stopping');
  children[1].emit('close', null, 'SIGTERM');
  await runner.exited();
  expect(runner.state().status).toBe('cancelled');
  expect(children).toHaveLength(2); // check-cut never started
  expect(runner.start('keynote', { repo: '/repo', folder: dir }).status).toBe('running');
});
