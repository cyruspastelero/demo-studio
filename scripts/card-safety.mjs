// Input checks for title-cards.mjs. handoff.json may come from someone else, and its brand values
// go into a <style> block of a page that headless Chrome renders, and its image paths are read
// from disk. So: CSS values pass a strict whitelist, text is escaped, and images must be image
// files inside the demo folder.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, resolve, sep } from 'node:path';

export class CardInputError extends Error {}

const FORBIDDEN_CSS = /[<>{};\\]|url\s*\(|expression\s*\(|@import|\/\*/i;
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*[0-9.]+%?\s*(?:,\s*|\s+)[0-9.]+%?\s*(?:,\s*|\s+)[0-9.]+%?\s*(?:(?:,|\/)\s*[0-9.]+%?\s*)?\)$/i;
const NAMED = /^[a-z]{3,20}$/i;
const FONT = /^[A-Za-z0-9 '",-]+$/;

export function checkColor(value, field) {
  const text = String(value ?? '').trim();
  if (FORBIDDEN_CSS.test(text) || !(HEX.test(text) || RGB.test(text) || NAMED.test(text))) {
    throw new CardInputError(`${field}: ${JSON.stringify(value)} is not a colour; use #RRGGBB, rgb(r, g, b) or a colour name`);
  }
  return text;
}

export function checkFont(value, field) {
  const text = String(value ?? '').trim();
  if (!text || FORBIDDEN_CSS.test(text) || !FONT.test(text)) {
    throw new CardInputError(`${field}: ${JSON.stringify(value)} is not a font list; use family names, quotes, `
      + `commas, spaces and hyphens only, for example "'Inter', system-ui, sans-serif"`);
  }
  return text;
}

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function within(root, path) {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
}

// A relative path from the config, resolved inside root. The target may not exist yet (an output
// folder), so symlinks are checked on the deepest part that does exist.
export function safeJoin(root, value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new CardInputError(`${field}: must be a non-empty relative path`);
  if (value.includes('\0')) throw new CardInputError(`${field}: path contains a NUL byte`);
  if (isAbsolute(value) || /^[A-Za-z]:/.test(value) || /^[\\/]/.test(value)) {
    throw new CardInputError(`${field}: absolute paths are not allowed (${value}); use a path inside the demo folder`);
  }
  if (value.split(/[\\/]+/).includes('..')) throw new CardInputError(`${field}: '..' is not allowed (${value})`);
  const realRoot = realpathSync(root);
  const full = resolve(realRoot, value);
  let existing = full;
  let rest = '';
  for (;;) {
    try {
      existing = realpathSync(existing);
      break;
    } catch {
      const parent = resolve(existing, '..');
      rest = existing.slice(parent.length + 1) + (rest ? sep + rest : '');
      if (parent === existing) break;
      existing = parent;
    }
  }
  const real = rest ? resolve(existing, rest) : existing;
  if (!within(realRoot, real)) throw new CardInputError(`${field}: ${value} resolves outside the demo folder`);
  return real;
}

// SVG is fine here: drawn through <img>, it cannot run script or load anything.
export const IMAGE_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

export function imageDataUri(root, value, field) {
  const path = safeJoin(root, value, field);
  const mime = IMAGE_TYPES[extname(path).toLowerCase()];
  if (!mime) {
    throw new CardInputError(`${field}: ${value} must be a ${Object.keys(IMAGE_TYPES).join(', ')} image`);
  }
  let stat;
  try {
    stat = statSync(path);
  } catch {
    throw new CardInputError(`${field}: image not found: ${value}`);
  }
  if (!stat.isFile()) throw new CardInputError(`${field}: ${value} is not a file`);
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

export function checkBrand(brand) {
  const out = { ...brand };
  for (const key of ['background', 'title_color', 'subtitle_color']) out[key] = checkColor(brand[key], `brand.${key}`);
  out.font = checkFont(brand.font, 'brand.font');
  return out;
}

// Lets the card page load nothing but inline data: images; no network, no file:// reads.
export async function blockRequests(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    return url.startsWith('data:') || url.startsWith('about:') ? route.continue() : route.abort('blockedbyclient');
  });
}
