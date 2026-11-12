import { spawn } from 'node:child_process';
import { existsSync, realpathSync, statSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DocumentStore, FILES, readDocument, SaveError } from './documents.mjs';
import { isDemoFolder, listDemos, workspace } from './demos.mjs';
import { isPassiveMedia, mediaIndex, sendFile, thumbnail } from './media.mjs';
import { insideAny, PathError, resolveInside } from './paths.mjs';
import { RenderRunner } from './render.mjs';

const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
const UI_DIR = join(APP_DIR, 'out');
const BODY_LIMIT = 5 * 1024 * 1024;
const MEDIA_SETTLE_MS = 500;

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new HttpError(413, 'request body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolvePromise(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new HttpError(400, 'request body is not JSON'));
      }
    });
    req.on('error', reject);
  });
}

function openWith(path, reveal) {
  const [cmd, args] = process.platform === 'darwin'
    ? ['open', reveal ? ['-R', path] : [path]]
    : ['xdg-open', [reveal ? join(path, '..') : path]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', (error) => {
    console.error(`studio: could not ${reveal ? 'reveal' : 'open'} ${path}: ${error.message}`);
  }).unref();
}

export function createStudio({ repo, cwd, folder: initialFolder, dev = false }) {
  const clients = new Set();
  let folder = null;
  let store = null;
  let rawWatcher = null;
  let mediaTimer = null;
  let vite = null;

  const emit = (event, data) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(payload);
  };

  const describeOutputs = (outputs) => outputs.map((path) => {
    const real = folder ? insideAny([folder], path) : null;
    if (!real) return { path, rel: null, isDir: false };
    return { path: real, rel: relative(folder, real), isDir: statSync(real).isDirectory() };
  });

  const runner = new RenderRunner((event, data) => {
    if (event === 'render' && data) {
      emit('render', { ...data, outputFiles: describeOutputs(data.outputs) });
      if (data.status !== 'running') emit('media-changed', {});
    } else if (event === 'render-line') {
      emit(event, { ...data, outputFiles: describeOutputs(data.outputs) });
    } else emit(event, data);
  });

  const mediaChanged = () => {
    clearTimeout(mediaTimer);
    mediaTimer = setTimeout(() => emit('media-changed', {}), MEDIA_SETTLE_MS);
  };

  function openFolder(path) {
    if (!existsSync(resolve(path)) || !statSync(resolve(path)).isDirectory()) throw new HttpError(404, `folder not found: ${resolve(path)}`);
    // Real path, so OUTPUT paths printed by scripts (already resolved) map back to relative ones.
    const dir = realpathSync(resolve(path));
    if (!isDemoFolder(dir)) throw new HttpError(400, `${dir} has no handoff.json or demo.json`);
    store?.close();
    rawWatcher?.close();
    folder = dir;
    store = new DocumentStore(dir, (doc) => emit('file-changed', doc));
    const handoff = readDocument(dir, 'handoff')?.data;
    const rawDir = join(dir, handoff?.paths?.raw ?? 'recordings/raw');
    rawWatcher = existsSync(rawDir) ? watch(rawDir, mediaChanged) : null;
    rawWatcher?.on('error', () => { rawWatcher = null; });
  }

  if (initialFolder) openFolder(initialFolder);

  function session() {
    if (!folder) return { mode: 'picker', repo, demos: listDemos({ cwd, repo }), workspace: workspace({ cwd }) };
    const files = Object.fromEntries(Object.keys(FILES).map((kind) => {
      const doc = readDocument(folder, kind);
      return [kind, doc && { name: doc.name, text: doc.text, hash: doc.hash, data: doc.data, errors: doc.errors }];
    }));
    const job = runner.state();
    return {
      mode: 'editor', repo, folder, name: folder.split('/').pop(), files, platform: process.platform,
      render: job && { ...job, outputFiles: describeOutputs(job.outputs) },
    };
  }

  // Home-screen requests name a demo by path; only folders the home screen listed are accepted.
  const listedDemo = (path) => {
    const found = listDemos({ cwd, repo }).find((d) => d.path === path);
    if (!found) throw new HttpError(403, 'not a listed demo folder');
    return found.path;
  };

  const requireFolder = () => {
    if (!folder) throw new HttpError(409, 'no demo folder is open');
    return folder;
  };

  async function api(req, res, url) {
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /api/session') return json(res, 200, session());
    if (route === 'GET /api/demos') return json(res, 200, listDemos({ cwd, repo }));
    if (route === 'GET /api/home') return json(res, 200, { mode: 'picker', repo, demos: listDemos({ cwd, repo }), workspace: workspace({ cwd }) });
    if (route === 'GET /api/demo-thumb') {
      const file = resolveInside(listedDemo(url.searchParams.get('demo') ?? ''), url.searchParams.get('path') ?? '');
      if (!isPassiveMedia(file)) throw new HttpError(400, 'not a video');
      const w = Math.min(640, Math.max(32, Number(url.searchParams.get('w')) || 480));
      const image = await thumbnail(file, Math.max(0, Number(url.searchParams.get('t')) || 0), w);
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=300' });
      return res.end(image);
    }
    if (route === 'POST /api/demo-reveal') {
      const { demo, path, action } = await readBody(req);
      const dir = listedDemo(String(demo ?? ''));
      const real = path ? resolveInside(dir, String(path)) : realpathSync(dir);
      // Only a regular file that is a video, an image or text is opened in its app. Everything
      // else is shown in the file manager and never launched: scripts, apps, and folders too,
      // since a folder can be a bundle (a .app) that `open` would run.
      const viewable = statSync(real).isFile() && (isPassiveMedia(real) || real.endsWith('.md'));
      openWith(real, action === 'reveal' || !viewable);
      return json(res, 200, { ok: true });
    }
    if (route === 'POST /api/open') {
      const { path } = await readBody(req);
      // Only folders the picker offered, so the page cannot open arbitrary paths.
      if (!listDemos({ cwd, repo }).some((d) => d.path === path)) throw new HttpError(403, 'not a listed demo folder');
      openFolder(path);
      return json(res, 200, session());
    }
    if (route === 'GET /api/media') {
      const dir = requireFolder();
      return json(res, 200, await mediaIndex(dir, readDocument(dir, 'handoff')?.data));
    }
    const save = /^PUT \/api\/file\/(handoff|demo)$/.exec(route);
    if (save) {
      requireFolder();
      const { data, baseHash } = await readBody(req);
      return json(res, 200, store.save(save[1], data, baseHash));
    }
    if (route === 'GET /api/thumb') {
      const file = resolveInside(requireFolder(), url.searchParams.get('path') ?? '');
      const t = Math.max(0, Number(url.searchParams.get('t')) || 0);
      const w = Math.min(640, Math.max(32, Number(url.searchParams.get('w')) || 160));
      const image = await thumbnail(file, t, w);
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=300' });
      return res.end(image);
    }
    if (route === 'POST /api/render') {
      const { kind, video } = await readBody(req);
      try {
        return json(res, 200, runner.start(kind, { repo, folder: requireFolder(), video }));
      } catch (error) {
        throw new HttpError(error.status ?? 400, error.message);
      }
    }
    if (route === 'POST /api/render/cancel') return json(res, 200, { cancelled: runner.cancel() });
    if (route === 'POST /api/reveal') {
      const { path, action } = await readBody(req);
      const real = insideAny([requireFolder()], String(path ?? ''));
      if (!real) throw new HttpError(403, 'only files inside the demo folder can be opened');
      // Only media and text open in their app; anything else (scripts, apps) is shown in the folder instead.
      openWith(real, action === 'reveal' || !isPassiveMedia(real));
      return json(res, 200, { ok: true });
    }
    if (route === 'GET /api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('event: hello\ndata: {}\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return undefined;
    }
    throw new HttpError(404, `no route ${route}`);
  }

  function serveUi(req, res, url) {
    if (dev && vite) return vite.middlewares(req, res, () => json(res, 404, { error: 'not found' }));
    if (!existsSync(join(UI_DIR, 'index.html'))) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('The editor UI is not built. Run: npm run build -w app');
    }
    let file;
    try {
      file = resolveInside(UI_DIR, url.pathname.replace(/^\/+/, '') || 'index.html');
      if (statSync(file).isDirectory()) file = join(UI_DIR, 'index.html');
    } catch {
      file = join(UI_DIR, 'index.html');
    }
    return sendFile(req, res, file);
  }

  async function handle(req, res, port) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    // Reject other hostnames (DNS rebinding) and cross-site writes.
    const host = req.headers.host ?? '';
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) throw new HttpError(403, 'bad host');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-studio'] !== '1') {
      throw new HttpError(403, 'missing x-studio header');
    }
    if (url.pathname.startsWith('/api/')) return api(req, res, url);
    if (url.pathname.startsWith('/media/')) {
      const rel = decodeURIComponent(url.pathname.slice('/media/'.length));
      return sendFile(req, res, resolveInside(requireFolder(), rel), { untrusted: true });
    }
    return serveUi(req, res, url);
  }

  const server = createServer((req, res) => {
    const port = server.address()?.port;
    handle(req, res, port).catch((error) => {
      const status = error instanceof HttpError || error instanceof SaveError || error instanceof PathError
        ? error.status : 500;
      if (status === 500) console.error(`studio: ${req.method} ${req.url} failed:`, error);
      if (!res.headersSent) json(res, status, { error: error.message, ...(error.extra ?? {}) });
      else res.end();
    });
  });

  async function listen(preferred, attempts = 20) {
    if (dev) {
      const { createServer: createVite } = await import('vite');
      vite = await createVite({ root: APP_DIR, server: { middlewareMode: true }, appType: 'spa' });
    }
    for (let port = preferred; port < preferred + attempts; port += 1) {
      const ok = await new Promise((resolvePromise, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          if (error.code === 'EADDRINUSE') resolvePromise(false);
          else reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolvePromise(true);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '127.0.0.1');
      });
      if (ok) return `http://127.0.0.1:${port}/`;
    }
    throw new Error(`no free port between ${preferred} and ${preferred + attempts - 1}`);
  }

  async function close() {
    runner.cancel();
    store?.close();
    rawWatcher?.close();
    for (const res of clients) res.end();
    await vite?.close();
    await new Promise((r) => server.close(r));
  }

  return { server, listen, close };
}
