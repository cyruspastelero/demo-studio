// The static demo (GitHub Pages) has no server. Every GET the editor makes is recorded once by
// scripts/snapshot-static-demo.mjs and saved under data/<key>; this maps a server URL to that key.
// Shared by the recorder (Node) and the app, so both always agree.
export function staticKey(url) {
  const [path, query = ''] = url.split('?');
  const clean = path.replace(/^\/+/, '');
  if (clean.startsWith('media/') || clean.startsWith('api/template-preview/') || clean.startsWith('api/ad-style-preview/')) return clean;
  const suffix = query ? `__${query.replace(/[^A-Za-z0-9.-]/g, '_')}` : '';
  const ext = /thumb$/.test(clean) ? '.jpg' : '.json';
  return `${clean}${suffix}${ext}`;
}
