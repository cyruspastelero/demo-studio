// Look templates for the home screen's Templates view. Read only. Two places hold them:
//   <demos root>/_templates/<id>/   the user's own (origin "workspace")
//   <plugin repo>/look-templates/<id>/   shipped with the plugin (origin "built-in")
// Each folder has template.json, README.md, source.json and preview/01.png..06.png (shape in
// schemas/template.schema.json). Only the two JSON files are read and
// only the preview PNGs are ever served. Symlinked folders or files, ids that fail the pattern and
// JSON that fails to parse are skipped, so a template folder from someone else cannot point the
// server at other files.
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import { demoRoot } from './demos.mjs';

export const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
export const ORIGINS = ['workspace', 'built-in'];
const PREVIEW_COUNT = 6;
const JSON_LIMIT = 256 * 1024;
const TEXT_LIMITS = { name: 120, description: 600, created: 40, file: 200 };
// Colours go into a style attribute, so only plain CSS colour syntax is accepted.
const COLOUR = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab)\([0-9.,%\s/+-]{1,60}\))$/;

export function templateRoots({ cwd, repo }) {
  return [
    { origin: 'workspace', root: join(demoRoot(cwd), '_templates') },
    { origin: 'built-in', root: join(repo, 'look-templates') },
  ];
}

// lstat that never throws: null for a missing path.
function lstat(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

const isRealDir = (path) => lstat(path)?.isDirectory() === true;
const isRealFile = (path) => lstat(path)?.isFile() === true;

function text(value, limit) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
}

function colour(value) {
  return typeof value === 'string' && COLOUR.test(value.trim()) ? value.trim() : null;
}

// The schema keeps colours in look.brand (accent, background.base). Older or hand-made files may
// use colours, colors or palette, or the top level; the background may be a colour or { base }.
export function lookColours(look) {
  if (!look || typeof look !== 'object') return { accent: null, background: null };
  const palette = [look.brand, look.colours, look.colors, look.palette, look].find((p) => p && typeof p === 'object');
  const background = palette.background ?? look.background;
  return {
    accent: colour(palette.accent) ?? colour(look.accent),
    background: colour(typeof background === 'object' && background ? background.base : background)
      ?? colour(palette.base),
  };
}

// Only the file's name and length are shown, never its path.
function source(value) {
  if (!value || typeof value !== 'object') return null;
  const file = text(value.file ?? value.video ?? value.name, TEXT_LIMITS.file);
  if (!file) return null;
  const duration = Number(value.duration ?? value.duration_s ?? value.seconds);
  return { file: basename(file), duration: Number.isFinite(duration) && duration >= 0 ? duration : null };
}

function readJson(file) {
  const stat = lstat(file);
  if (!stat?.isFile() || stat.size > JSON_LIMIT) return null;
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export function previewName(index) {
  return `${String(index).padStart(2, '0')}.png`;
}

export function previewUrl(origin, id, index) {
  return `/api/template-preview/${origin}/${id}/${previewName(index)}`;
}

function readTemplate(origin, dir, id) {
  const data = readJson(join(dir, 'template.json'));
  if (!data) return null;
  const previewDir = join(dir, 'preview');
  const previews = [];
  if (isRealDir(previewDir)) {
    for (let i = 1; i <= PREVIEW_COUNT; i += 1) {
      if (isRealFile(join(previewDir, previewName(i)))) previews.push(previewUrl(origin, id, i));
    }
  }
  return {
    id,
    name: text(data.name, TEXT_LIMITS.name) ?? id,
    description: text(data.description, TEXT_LIMITS.description) ?? '',
    created: text(data.created, TEXT_LIMITS.created),
    origin,
    // template.json's source is how it was made ("copied"...); a copied look's video is in source.json.
    source: source(typeof data.source === 'object' ? data.source : readJson(join(dir, 'source.json'))),
    previews,
    colours: lookColours(data.look),
  };
}

function scan({ origin, root }) {
  if (!isRealDir(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && TEMPLATE_ID.test(entry.name))
    .map((entry) => readTemplate(origin, join(root, entry.name), entry.name))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listTemplates(options) {
  return templateRoots(options).flatMap(scan);
}

// The preview PNG for /api/template-preview/<origin>/<id>/<NN>.png, or null. Every level (root's
// template folder, preview folder, file) must be a real folder or regular file, not a symlink, and
// the real path must stay inside the root.
export function previewFile(options, origin, id, name) {
  if (!ORIGINS.includes(origin) || !TEMPLATE_ID.test(id)) return null;
  if (!/^0[1-6]\.png$/.test(name)) return null;
  const { root } = templateRoots(options).find((r) => r.origin === origin);
  if (!isRealDir(root)) return null;
  const dir = join(root, id);
  const file = join(dir, 'preview', name);
  if (!isRealDir(dir) || !isRealDir(join(dir, 'preview')) || !isRealFile(file)) return null;
  const realRoot = realpathSync(root);
  const real = realpathSync(file);
  return real.startsWith(realRoot + sep) ? real : null;
}
