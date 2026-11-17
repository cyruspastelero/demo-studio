// Node side of the untrusted-demo-folder rules (SECURITY.md): demo.json windows are validated before
// they become CDP URLs, the studio's ffmpeg calls read only local files, and the editor's saves go
// through an unguessable O_EXCL temp file. Run: node tests/test_security.mjs
import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserProblems, windowProblems } from '../scripts/pw.mjs';
import { PROTOCOL_WHITELIST, probeDuration, thumbnail } from '../app/server/media.mjs';
import { DocumentStore, hashText, tempPath } from '../app/server/documents.mjs';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const dir = mkdtempSync(join(tmpdir(), 'ds-security-'));
try {
  await test('a window needs a whole port number from 1024 to 65535 and a plain match string', async () => {
    assert.deepEqual(windowProblems('admin', { port: 9334, match: 'slack.com', rx_port: 8766 }), []);
    for (const win of [{ port: '9334' }, { port: 80 }, { port: 70000 }, { port: 9333.5 }, { port: '9333@evil.example' },
      { port: 9333, rx_port: 'x' }, { port: 9333, match: 'a b' }, { port: 9333, match: 'x\n' }, { port: 9333, match: 7 },
      null, ['port']]) {
      assert.ok(windowProblems('w', win).length, JSON.stringify(win));
    }
  });

  await test('browser timezone and locale must look like a zone and a locale', async () => {
    assert.deepEqual(browserProblems(undefined), []);
    assert.deepEqual(browserProblems({ timezone: 'Asia/Manila', locale: 'en-PH' }), []);
    for (const browser of [{ timezone: '../../x' }, { locale: 'en US' }, { locale: 3 }, 'Asia/Manila']) {
      assert.ok(browserProblems(browser).length, JSON.stringify(browser));
    }
  });

  await test('the studio ffmpeg and ffprobe calls do not follow a playlist out to a URL', async () => {
    assert.deepEqual(PROTOCOL_WHITELIST, ['-protocol_whitelist', 'file,pipe']);
    const playlist = join(dir, 'take.m3u8');
    writeFileSync(playlist, '#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:9/x.ts\n#EXT-X-ENDLIST\n');
    await assert.rejects(thumbnail(playlist, 0, 160), /not on whitelist/);
    const errors = [];
    const original = console.error;
    console.error = (line) => errors.push(String(line));
    try {
      assert.equal(await probeDuration(playlist), null);
    } finally {
      console.error = original;
    }
    assert.match(errors.join('\n'), /not on whitelist/);
  });

  await test('editor saves use a random temp name created with O_EXCL, never a pid', async () => {
    const a = tempPath(dir, 'demo.json');
    assert.notEqual(a, tempPath(dir, 'demo.json'));
    assert.match(a, /\.demo\.json\.studio-[0-9a-f]{24}\.tmp$/);
    assert.doesNotMatch(a, new RegExp(`studio-${process.pid}\\.tmp$`));
  });

  await test('saving over a demo.json that is a symlink replaces the link and leaves its target alone', async () => {
    const demo = join(dir, 'demo');
    const outside = join(dir, 'outside.json');
    mkdirSync(demo);
    writeFileSync(outside, '{"title":"Theirs","sequence":[{"card":"a","title":"x"}]}\n');
    symlinkSync(outside, join(demo, 'demo.json'));
    const store = new DocumentStore(demo, () => {});
    try {
      const current = readFileSync(join(demo, 'demo.json'), 'utf8');
      store.save('demo', { title: 'Mine', sequence: [{ card: 'a', title: 'x' }] }, hashText(current));
    } finally {
      store.close();
    }
    assert.equal(readFileSync(outside, 'utf8'), '{"title":"Theirs","sequence":[{"card":"a","title":"x"}]}\n');
    assert.ok(!lstatSync(join(demo, 'demo.json')).isSymbolicLink());
    assert.match(readFileSync(join(demo, 'demo.json'), 'utf8'), /"Mine"/);
    assert.deepEqual(readdirSync(demo).filter((n) => n.endsWith('.tmp')), []);
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\nsecurity tests passed (${passed})`);
