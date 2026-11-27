import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// A fake child for each spawn, so no script runs and no real process group is signalled.
const children = [];
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal()),
  spawn: () => {
    const child = Object.assign(new EventEmitter(), { pid: 999999, stdout: new PassThrough(), stderr: new PassThrough() });
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
