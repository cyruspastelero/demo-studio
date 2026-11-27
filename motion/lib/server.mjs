// Tiny static server for the runtime: /engine and /lib from the motion folder, /file/<abs path>
// only for files or folders the storyboard references (allow-list), bound to 127.0.0.1.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' };

/** The server URL for an absolute file path, each segment escaped (spaces, #, ? and % in folder names). */
export const fileUrl = (abs) => `/file${abs.split(sep).map(encodeURIComponent).join('/')}`;

export function startServer(motionDir, allowed, fontDirs = []) {
  const roots = [...allowed].map((p) => resolve(p));
  const isAllowed = (abs) => roots.some((r) => abs === r || abs.startsWith(r + sep));
  let port = 0;
  const server = createServer((req, res) => {
    // Only the runtime page (opened on 127.0.0.1) may read media, not a DNS-rebound web page.
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) { res.writeHead(403); res.end('forbidden host'); return; }
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end('bad url escape'); return; }
    let abs = null;
    if (path.startsWith('/file/')) { abs = resolve(path.slice(5)); if (!isAllowed(abs)) abs = null; }
    else if (path.startsWith('/fonts/')) { const name = path.slice(7); abs = /^[\w.-]+$/.test(name) ? fontDirs.map((d) => resolve(d, name)).find((f) => existsSync(f)) || null : null; }
    else if (path.startsWith('/engine/') || path.startsWith('/lib/')) { abs = resolve(motionDir, `.${path}`); if (!abs.startsWith(resolve(motionDir) + sep)) abs = null; }
    if (!abs || !abs.startsWith(sep) || !existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(abs).toLowerCase()] || 'application/octet-stream', 'cache-control': 'max-age=3600' });
    createReadStream(abs).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => { port = server.address().port; ok({ server, port }); }));
}
