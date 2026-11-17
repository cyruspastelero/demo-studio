// Input checks used by scripts/title-cards.mjs, without a browser.
// Run: node tests/test_card_safety.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CardInputError, checkBrand, checkColor, checkFont, escapeHtml, imageDataUri, safeJoin,
} from '../scripts/card-safety.mjs';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}
const rejects = (fn, field) => assert.throws(fn, (e) => e instanceof CardInputError && e.message.startsWith(field));

const root = mkdtempSync(join(tmpdir(), 'cards-test-'));
const outside = mkdtempSync(join(tmpdir(), 'cards-outside-'));
try {
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(root, 'assets', 'notes.txt'), 'hi');
  writeFileSync(join(outside, 'secret.png'), 'secret');
  symlinkSync(join(outside, 'secret.png'), join(root, 'assets', 'link.png'));

  test('colours: hex, rgb() and names pass', () => {
    for (const c of ['#fff', '#F6F6F8', '#11223344', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'rgb(1 2 3 / 50%)', 'white']) {
      assert.equal(checkColor(c, 'brand.background'), c);
    }
  });
  test('colours: anything that could break out of the style block is rejected', () => {
    for (const c of ['red;}</style><script>', 'url(http://x)', 'red}', 'expression(alert(1))', '#fff;x:y', '', 'a\\62']) {
      rejects(() => checkColor(c, 'brand.title_color'), 'brand.title_color');
    }
  });
  test('fonts: family lists pass, CSS punctuation and url( are rejected', () => {
    assert.ok(checkFont("'SF Pro Display', system-ui, -apple-system, \"Helvetica Neue\", sans-serif", 'brand.font'));
    for (const f of ["x;}</style>", 'a{b}', 'url(x)', 'a\\b', 'a/*c*/', "@import 'x'", '']) {
      rejects(() => checkFont(f, 'brand.font'), 'brand.font');
    }
  });
  test('checkBrand names the bad field', () => {
    assert.throws(() => checkBrand({ background: '#fff', title_color: '#000', subtitle_color: 'x;y', font: 'a' }),
      /^Error: brand\.subtitle_color|brand\.subtitle_color/);
  });
  test('text is HTML-escaped, quotes included', () => {
    assert.equal(escapeHtml(`<img src="x" onerror='y'>&`), '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;');
  });
  test('paths: absolute, .., NUL and drive letters are rejected', () => {
    for (const p of ['/etc/hosts', '../x.png', 'assets/../../x.png', 'a\0b', 'C:\\x.png', '\\\\server\\x', '']) {
      rejects(() => safeJoin(root, p, 'brand.logo'), 'brand.logo');
    }
    assert.ok(safeJoin(root, 'recordings/editor-handoff', 'paths.out').endsWith(join('recordings', 'editor-handoff')));
  });
  test('images: an image inside the demo folder becomes a data: URI', () => {
    assert.match(imageDataUri(root, 'assets/logo.png', 'brand.logo'), /^data:image\/png;base64,/);
  });
  test('images: a symlink out of the demo folder, a non-image or a missing file is rejected', () => {
    rejects(() => imageDataUri(root, 'assets/link.png', 'cards.card-x.people[0].photo'), 'cards.card-x.people[0].photo');
    rejects(() => imageDataUri(root, 'assets/notes.txt', 'brand.logo'), 'brand.logo');
    rejects(() => imageDataUri(root, 'assets/none.png', 'brand.logo'), 'brand.logo');
    rejects(() => imageDataUri(root, 'assets', 'brand.logo'), 'brand.logo');
  });
} finally {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}
console.log(`\ncard safety tests passed (${passed})`);
