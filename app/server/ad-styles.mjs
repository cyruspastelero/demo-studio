// Launch-ad styles (motion-templates/<id>/) for the home screen's Templates view. Read only: each
// folder's style.json gives the name, description and tags, and only its preview/NN.jpg frames are
// ever served. Symlinks, odd ids and unreadable JSON are skipped, as for the look templates.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const FRAME = /^(0[1-9]|10)\.jpg$/;
const JSON_LIMIT = 256 * 1024;
const SAMPLES_URL = 'https://github.com/cyruspastelero/demo-studio/releases/download/samples';
// A finished ad made with the style, published on the samples release (the README links them too).
const SAMPLES = {
  airy: { label: 'demo-studio launch ad', url: `${SAMPLES_URL}/sample-launch-ad.mp4` },
  daylight: { label: 'Switchyard launch ad', url: `${SAMPLES_URL}/sample-daylight-ad.mp4` },
};

const stat = (path) => {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
};
const text = (value, limit) => (typeof value === 'string' ? value.slice(0, limit) : '');
const title = (id) => id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');

function readStyle(root, id) {
  const dir = join(root, id);
  const file = join(dir, 'style.json');
  if (!stat(dir)?.isDirectory() || !stat(file)?.isFile() || stat(file).size > JSON_LIMIT) return null;
  let style;
  try {
    style = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  const frames = stat(join(dir, 'preview'))?.isDirectory() ? readdirSync(join(dir, 'preview')).filter((f) => FRAME.test(f)).sort() : [];
  return {
    id,
    name: title(text(style.name, 60) || id),
    description: text(style.description, 600),
    bestFor: Array.isArray(style.best_for) ? style.best_for.filter((t) => typeof t === 'string' && t !== 'default').slice(0, 8) : [],
    tone: style.tone === 'dark' ? 'dark' : 'light',
    previews: frames.filter((f) => stat(join(dir, 'preview', f))?.isFile()).map((f) => `/api/ad-style-preview/${id}/${f}`),
    sample: SAMPLES[id] ?? null,
  };
}

export function listAdStyles(repo) {
  const root = join(repo, 'motion-templates');
  if (!stat(root)?.isDirectory()) return [];
  return readdirSync(root).filter((id) => ID.test(id)).sort().map((id) => readStyle(root, id)).filter(Boolean);
}

// The file for /api/ad-style-preview/<id>/<NN>.jpg, or null.
export function adStylePreview(repo, id, name) {
  if (!ID.test(id) || !FRAME.test(name)) return null;
  const file = join(repo, 'motion-templates', id, 'preview', name);
  for (const path of [join(repo, 'motion-templates', id), join(repo, 'motion-templates', id, 'preview')]) {
    if (!stat(path)?.isDirectory()) return null;
  }
  return stat(file)?.isFile() ? file : null;
}
