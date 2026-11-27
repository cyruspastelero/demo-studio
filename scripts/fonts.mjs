// The fonts on-screen text can use: the bundled ones in assets/fonts, and any font file the demo
// keeps in its own fonts/ folder (drop a .woff2, .woff, .ttf or .otf there and it is listed).
// Shared by the editor's server, text-overlays.mjs and keynote-render.mjs, so every place draws
// text from the same file.
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FONT, fontFamily } from '../app/shared/text-style.mjs';

export { DEFAULT_FONT, fontFamily };

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts');

export const BUNDLED = [
  { id: 'inter', name: 'Inter', file: 'InterVariable.woff2' },
  { id: 'inter-display', name: 'Inter Display', file: 'InterDisplay-Medium.woff2' },
  { id: 'geist', name: 'Geist', file: 'GeistVariable.woff2' },
  { id: 'geist-mono', name: 'Geist Mono', file: 'GeistMonoVariable.woff2' },
  { id: 'figtree', name: 'Figtree', file: 'FigtreeVariable.woff2' },
];
const FORMATS = { '.woff2': ['font/woff2', 'woff2'], '.woff': ['font/woff', 'woff'], '.ttf': ['font/ttf', 'truetype'], '.otf': ['font/otf', 'opentype'] };
// A file straight inside fonts/: letters, digits, space and . _ ( ) -, with a font extension.
const DEMO_FONT = /^fonts\/[A-Za-z0-9 ._()-]{1,120}\.(woff2|woff|ttf|otf)$/;

export class FontError extends Error {}

export function isFontId(id) {
  return typeof id === 'string' && (BUNDLED.some((f) => f.id === id) || (DEMO_FONT.test(id) && !id.includes('..')));
}

const nameOf = (file) => file.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

// Bundled first (Inter, the default, leads), then the demo's own fonts by file name.
export function listFonts(demoDir) {
  const own = [];
  let files = [];
  try {
    files = readdirSync(join(demoDir, 'fonts'));
  } catch {
    files = []; // no fonts/ folder: only the bundled fonts
  }
  for (const file of files.sort((a, b) => a.localeCompare(b))) {
    const id = `fonts/${file}`;
    if (!isFontId(id)) continue;
    try {
      fontFile(demoDir, id);
    } catch {
      continue; // a link out of the folder, or not a regular file
    }
    own.push({ id, name: nameOf(file), source: 'demo' });
  }
  return [...BUNDLED.map(({ id, name }) => ({ id, name, source: 'bundled' })), ...own];
}

// The real path of a font, checked: a bundled name, or a regular file inside <demo>/fonts.
export function fontFile(demoDir, id) {
  if (!isFontId(id)) throw new FontError(`font ${JSON.stringify(id)} is not a bundled font or a file in fonts/`);
  const bundled = BUNDLED.find((f) => f.id === id);
  if (bundled) return join(ASSETS, bundled.file);
  let real;
  let root;
  try {
    root = realpathSync(join(demoDir, 'fonts'));
    real = realpathSync(join(demoDir, id));
  } catch {
    throw new FontError(`font ${id} was not found in the demo's fonts/ folder`);
  }
  if (!real.startsWith(root + sep) || !statSync(real).isFile()) throw new FontError(`font ${id} must be a file inside fonts/`);
  return real;
}


export function fontFormat(id) {
  return FORMATS[extname(BUNDLED.find((f) => f.id === id)?.file ?? id).toLowerCase()];
}

// @font-face from a data: URI, for pages that may not load files (the render pages block requests).
export function fontFaceCss(demoDir, id) {
  const [mime, format] = fontFormat(id);
  const data = readFileSync(fontFile(demoDir, id)).toString('base64');
  return `@font-face { font-family: '${fontFamily(id)}'; src: url(data:${mime};base64,${data}) format('${format}');`
    + ' font-weight: 100 900; font-style: normal; font-display: block; }\n';
}
