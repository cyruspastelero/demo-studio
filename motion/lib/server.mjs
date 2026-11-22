// Tiny static server for the runtime: /engine and /lib from the motion folder, /file/<abs path>
// only for files or folders the storyboard references (allow-list), bound to 127.0.0.1.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' };

export function startServer(motionDir, allowed, fontDirs = []) {
  const roots = [...allowed].map((p) => resolve(p));
  const isAllowed = (abs) => roots.some((r) => abs === r || abs.startsWith(r + sep));
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let abs = null;
    if (path.startsWith('/file/')) { abs = resolve(path.slice(5)); if (!isAllowed(abs)) abs = null; }
    else if (path.startsWith('/fonts/')) { const name = path.slice(7); abs = /^[\w.-]+$/.test(name) ? fontDirs.map((d) => resolve(d, name)).find((f) => existsSync(f)) || null : null; }
    else if (path.startsWith('/engine/') || path.startsWith('/lib/')) { abs = resolve(motionDir, `.${path}`); if (!abs.startsWith(resolve(motionDir) + sep)) abs = null; }
    if (!abs || !abs.startsWith(sep) || !existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(abs).toLowerCase()] || 'application/octet-stream', 'cache-control': 'max-age=3600' });
    createReadStream(abs).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}
