// Behaviour of scripts/frame-receiver.mjs: per-run token, Host/Origin checks, take names, body
// limits and blur box validation. Starts the receiver on a random port in a temp folder.
// Run: node tests/test_frame_receiver.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/frame-receiver.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'rx-test-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const child = spawn(process.execPath, [SCRIPT, dir], {
  env: { ...process.env, DEMO_RX_PORT: String(port), DEMO_MIN_FREE_GB: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function post(path, { headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'POST', headers }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', (error) => (error.code === 'ECONNRESET' || error.code === 'EPIPE'
      ? resolve({ status: 413, text: 'reset' }) : reject(error)));
    req.end(body);
  });
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]).toString('base64');

try {
  const tokenFile = join(dir, '.rx-token');
  for (let i = 0; i < 50 && !existsSync(tokenFile); i += 1) await sleep(100);
  assert.ok(existsSync(tokenFile), 'receiver did not write .rx-token');
  const token = JSON.parse(readFileSync(tokenFile, 'utf8'))[String(port)];
  const auth = { 'x-rx-token': token };

  await test('the token file is private (mode 600) and holds a long random token', async () => {
    assert.equal(statSync(tokenFile).mode & 0o777, 0o600);
    assert.match(token, /^[0-9a-f]{48}$/);
  });
  await test('a request without the token is refused', async () => {
    assert.equal((await post('/start?take=a')).status, 403);
  });
  await test('a request with a wrong token is refused', async () => {
    assert.equal((await post('/start?take=a', { headers: { 'x-rx-token': 'f'.repeat(48) } })).status, 403);
  });
  await test('a request from a web page (Origin header) is refused even with the token', async () => {
    assert.equal((await post('/start?take=a', { headers: { ...auth, origin: 'https://evil.example' } })).status, 403);
  });
  await test('a request with a foreign Host (DNS rebinding) is refused', async () => {
    assert.equal((await post('/start?take=a', { headers: { ...auth, host: `evil.example:${port}` } })).status, 403);
  });
  await test('take names cannot be dot segments or start with a dot', async () => {
    for (const take of ['..', '.', '.hidden', 'a..b', '../x', 'a/b']) {
      assert.equal((await post(`/start?take=${encodeURIComponent(take)}`, { headers: auth })).status, 400, take);
    }
  });
  await test('a normal take records frames and blur boxes', async () => {
    assert.equal((await post('/start?take=01-scene-t1', { headers: auth })).status, 200);
    const frame = await post('/frame', { headers: auth, body: JSON.stringify({ ts: 1000, b64: JPEG }) });
    assert.equal(frame.status, 200);
    const blur = await post('/blur', { headers: auth, body: JSON.stringify({ x: 1, y: 2, w: 3, h: 4, t: 1000 }) });
    assert.equal(blur.status, 200);
  });
  await test('blur boxes must be numbers in range', async () => {
    for (const box of [{ x: '1;evil', y: 0, w: 1, h: 1, t: 1 }, { x: 0, y: 0, w: -1, h: 1, t: 1 },
      { x: 0, y: 0, w: 1, h: 1, t: 1, until: 'later' }, { x: 0, y: 0, w: 1e9, h: 1, t: 1 }]) {
      assert.equal((await post('/blur', { headers: auth, body: JSON.stringify(box) })).status, 400, JSON.stringify(box));
    }
    const lines = readFileSync(join(dir, 'frames', '01-scene-t1', 'blur.jsonl'), 'utf8').trim().split('\n');
    assert.deepEqual(lines.map((l) => JSON.parse(l)), [{ x: 1, y: 2, w: 3, h: 4, t: 1000 }]);
  });
  await test('frames must be JPEG data', async () => {
    const bad = await post('/frame', { headers: auth, body: JSON.stringify({ ts: 2000, b64: Buffer.from('<html>').toString('base64') }) });
    assert.equal(bad.status, 400);
  });
  await test('oversized bodies are refused', async () => {
    const big = 'x'.repeat(8 * 1024);
    assert.equal((await post('/blur', { headers: auth, body: big })).status, 413);
  });
  await test('stop reports the frames and the receiver keeps serving', async () => {
    const stop = await post('/stop', { headers: auth });
    assert.equal(stop.status, 200);
    assert.equal(JSON.parse(stop.text).frames, 1);
  });
  await test('a take folder planted as a symlink is refused and nothing lands outside', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'rx-outside-'));
    try {
      symlinkSync(outside, join(dir, 'frames', 'planted-t1'));
      assert.equal((await post('/start?take=planted-t1', { headers: auth })).status, 409);
      assert.equal((await post('/frame', { headers: auth, body: JSON.stringify({ ts: 5000, b64: JPEG }) })).status, 409);
      assert.deepEqual(readdirSync(outside), []);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
  await test('frame, blur, ts and end files planted as symlinks are never written through', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'rx-outside-'));
    const victim = join(outside, 'victim.txt');
    writeFileSync(victim, 'keep');
    try {
      const take = join(dir, 'frames', 'links-t1');
      mkdirSync(take, { recursive: true });
      for (const name of ['f00000.jpg', 'blur.jsonl', 'ts.txt']) symlinkSync(victim, join(take, name));
      assert.equal((await post('/start?take=links-t1', { headers: auth })).status, 200);
      assert.equal((await post('/frame', { headers: auth, body: JSON.stringify({ ts: 6000, b64: JPEG }) })).status, 409);
      const blur = await post('/blur', { headers: auth, body: JSON.stringify({ x: 1, y: 2, w: 3, h: 4, t: 1000 }) });
      assert.equal(blur.status, 409);
      assert.equal((await post('/stop', { headers: auth })).status, 409);
      assert.equal(readFileSync(victim, 'utf8'), 'keep');
      assert.ok(lstatSync(join(take, 'ts.txt')).isSymbolicLink());
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
  await test('the token is written through a random temp name and leaves no temp file', async () => {
    assert.deepEqual(readdirSync(dir).filter((name) => name.startsWith('.rx-token.')), []);
  });
  await test('rx-tokens.mjs passes the token to scene code and drops anything that is not port -> hex', async () => {
    const { readRxTokens, rxTokensLine } = await import('../scripts/rx-tokens.mjs');
    assert.deepEqual(readRxTokens(dir), { [String(port)]: token });
    writeFileSync(tokenFile, JSON.stringify({ 8765: 'ab'.repeat(24), '1};alert(1);//': 'ab'.repeat(24), 9000: "'};evil()//" }));
    assert.equal(rxTokensLine(dir), `const RX_TOKENS = {"8765":"${'ab'.repeat(24)}"};`);
  });
} finally {
  child.kill();
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\nframe-receiver tests passed (${passed})`);
