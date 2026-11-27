// The font catalogue shared by the editor, the text overlays and the keynote render.
// Run: node tests/test_fonts.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_FONT, FontError, fontFaceCss, fontFamily, fontFile, isFontId, listFonts } from '../scripts/fonts.mjs';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const demo = mkdtempSync(join(tmpdir(), 'fonts-demo-'));
const outside = mkdtempSync(join(tmpdir(), 'fonts-outside-'));
try {
  mkdirSync(join(demo, 'fonts'));
  writeFileSync(join(demo, 'fonts', 'Brand Sans-Bold.woff2'), 'wOF2');
  writeFileSync(join(demo, 'fonts', 'Serif.ttf'), 'ttf');
  writeFileSync(join(demo, 'fonts', 'notes.txt'), 'not a font');
  writeFileSync(join(outside, 'secret.woff2'), 'secret');
  symlinkSync(join(outside, 'secret.woff2'), join(demo, 'fonts', 'link.woff2'));

  test('lists the bundled fonts first, with Inter as the default, then the demo fonts by name', () => {
    const fonts = listFonts(demo);
    assert.equal(DEFAULT_FONT, 'inter');
    assert.equal(fonts[0].id, 'inter');
    assert.ok(fonts.some((f) => f.id === 'geist' && f.source === 'bundled'));
    const own = fonts.filter((f) => f.source === 'demo');
    assert.deepEqual(own.map((f) => [f.id, f.name]), [['fonts/Brand Sans-Bold.woff2', 'Brand Sans Bold'], ['fonts/Serif.ttf', 'Serif']]);
  });

  test('a demo without a fonts folder still lists the bundled fonts', () => {
    const bare = mkdtempSync(join(tmpdir(), 'fonts-bare-'));
    assert.ok(listFonts(bare).length >= 5);
    rmSync(bare, { recursive: true, force: true });
  });

  test('ids are a bundled name or a font file in fonts/', () => {
    for (const ok of ['inter', 'geist-mono', 'fonts/Brand Sans-Bold.woff2', 'fonts/a.otf']) assert.ok(isFontId(ok), ok);
    for (const bad of ['comic', 'fonts/../x.woff2', 'fonts/a/b.woff2', '/etc/x.ttf', 'fonts/x.svg', "fonts/a'b.woff2", 'fonts/a\\b.ttf']) {
      assert.ok(!isFontId(bad), bad);
    }
  });

  test('resolves files inside the demo and refuses links that leave it', () => {
    assert.ok(fontFile(demo, 'fonts/Serif.ttf').endsWith('Serif.ttf'));
    assert.ok(fontFile(demo, 'inter').endsWith('InterVariable.woff2'));
    assert.throws(() => fontFile(demo, 'fonts/link.woff2'), FontError);
    assert.throws(() => fontFile(demo, 'fonts/missing.woff2'), FontError);
    assert.throws(() => fontFile(demo, 'fonts/../../x.woff2'), FontError);
  });

  test('builds a data: @font-face with a safe family name', () => {
    const css = fontFaceCss(demo, 'fonts/Serif.ttf');
    assert.match(css, new RegExp(`font-family: '${fontFamily('fonts/Serif.ttf')}'`));
    assert.match(css, /url\(data:font\/ttf;base64,dHRm\) format\('truetype'\)/);
    // Same values as font_family() in scripts/keynote/overlay.py (tests/test_keynote.py checks them too).
    assert.equal(fontFamily('fonts/Brand Sans.woff2'), 'dsf-fonts-Brand-Sans-woff2-b59e44fc');
    assert.notEqual(fontFamily('fonts/My Font.ttf'), fontFamily('fonts/My-Font.ttf'));
  });
} finally {
  rmSync(demo, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}
console.log(`fonts: ${passed} passed`);
