import { STATIC_DEMO, STATIC_DEMO_NOTICE, serverUrl } from './lib/static-demo';
import type { FileKind, MediaIndex } from './lib/types';

export interface FileState {
  name: string;
  text: string;
  hash: string;
  data: unknown;
  errors: string[];
}

export type CheckStatus = 'PASS' | 'FAIL' | 'LOOK';
export interface CheckRow { status: CheckStatus; item: string; text: string }
export interface CheckResult { tool: 'video-gate' | 'check-cut'; rows: CheckRow[] }

export interface OutputFile {
  path: string;
  rel: string | null;
  isDir: boolean;
  // Present on a finished video once the server has checked it (or tried to).
  checks?: CheckResult[];
  note?: string | null;
}

export interface RenderState {
  id: number;
  kind: string;
  label: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  progress: { stage: string; done: number; total: number } | null;
  outputs: string[];
  outputFiles?: OutputFile[];
  checking?: boolean;
  log: { stream: string; line: string }[];
  error?: string | null;
}

export interface DemoOverview {
  stages: { key: string; label: string; done: boolean }[];
  next: { stage: string; label: string; prompt: string } | null;
  scenes: number;
  takes: { total: number; keep: number; alt: number; reject: number; unreviewed: number };
  attention: string[];
  videos: { label: string; rel: string }[];
  poster: string | null;
  docs: { name: string; rel: string }[];
  folders: { handoff: string | null };
}

export interface DemoEntry {
  path: string;
  name: string;
  title: string | null;
  group: string;
  hasHandoff: boolean;
  hasDemo: boolean;
  canEdit: boolean;
  modified: number;
  status: { status: string; note: string } | null;
  overview: DemoOverview;
}

export interface Workspace {
  root: string;
  exists: boolean;
  hasPlaybook: boolean;
  hasIndex: boolean;
  hasCheck: boolean;
}

export type HomeSession = { mode: 'picker'; repo: string; demos: DemoEntry[]; workspace: Workspace };

export type Session =
  | HomeSession
  | {
    mode: 'editor'; repo: string; folder: string; openId?: string; name: string; platform: string;
    files: Record<FileKind, FileState | null>; render: RenderState | null;
  };

export interface FontInfo {
  id: string; // 'inter' or 'fonts/<file>' (see scripts/fonts.mjs)
  name: string;
  source: 'bundled' | 'demo';
}

// Where the editor loads a font file from. The static demo ships the bundled fonts next to the page.
export function fontUrl(id: string): string {
  return STATIC_DEMO ? `./data/fonts/${encodeURIComponent(id)}` : `/fonts/${encodeURIComponent(id)}`;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) {
    super(message);
  }
}

// The id of the demo this tab opened. The server refuses saves and renders that carry an older one,
// so a tab left on one demo cannot write into another demo opened since in a second tab.
let openId: string | null = null;
const KEEPALIVE_LIMIT = 60 * 1024;

// The server's answer when another demo was opened since this tab opened its own.
export const isStaleOpen = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 412 && error.body.code === 'stale-open';

async function call<T>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  if (STATIC_DEMO) return staticCall<T>(method, path);
  const headers: Record<string, string> = body === undefined ? { 'x-studio': '1' } : { 'content-type': 'application/json', 'x-studio': '1' };
  if (openId) headers['x-studio-open'] = openId;
  const text = body === undefined ? undefined : JSON.stringify(body);
  // Browsers refuse a keepalive request over 64 KB, so a bigger body goes as a normal request.
  const small = text === undefined || new TextEncoder().encode(text).length < KEEPALIVE_LIMIT;
  const res = await fetch(path, { method, headers, body: text, keepalive: keepalive && small });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `${method} ${path} failed (${res.status})`, res.status, data);
  if (data?.mode === 'editor' && typeof data.openId === 'string') openId = data.openId;
  return data as T;
}

// In the static demo a save is kept in memory (the editor already holds the data); anything that
// needs the machine (render, reveal, open) explains that it needs the local studio.
let staticSaves = 0;
async function staticCall<T>(method: string, path: string): Promise<T> {
  // Opening the sample demo replays the recorded answer; it is the only demo in the static build.
  // ?open starts straight in it, and the home screen is the recorded first session.
  if (method === 'GET' || path === '/api/open') {
    const startInEditor = path === '/api/session' && new URLSearchParams(window.location.search).has('open');
    const recorded = startInEditor ? '/api/open' : path === '/api/home' ? '/api/session' : path;
    const res = await fetch(serverUrl(recorded));
    if (!res.ok) throw new ApiError(`${path} is not part of the demo`, res.status, {});
    return (await res.json()) as T;
  }
  if (method === 'PUT' && path.startsWith('/api/file/')) {
    staticSaves += 1;
    return { hash: `demo-${staticSaves}` } as T;
  }
  throw new ApiError(STATIC_DEMO_NOTICE, 501, {});
}

export const api = {
  session: () => call<Session>('GET', '/api/session'),
  home: () => call<HomeSession>('GET', '/api/home'),
  revealInDemo: (demo: string, path: string | null, action: 'reveal' | 'open') =>
    call('POST', '/api/demo-reveal', { demo, path, action }),
  open: (path: string) => call<Session>('POST', '/api/open', { path }),
  // Copies an example into the user's demos with sample footage and opens the copy. The static demo
  // has no server to copy with, so it opens the example itself (edits stay in the tab there).
  tryExample: (path: string) => call<Session>('POST', STATIC_DEMO ? '/api/open' : '/api/try-example', { path }),
  media: () => call<MediaIndex>('GET', '/api/media'),
  fonts: () => call<FontInfo[]>('GET', '/api/fonts'),
  // keepalive lets a save started as the tab closes finish after the page is gone.
  save: (kind: FileKind, data: unknown, baseHash: string | null, keepalive = false) =>
    call<{ hash: string }>('PUT', `/api/file/${kind}`, { data, baseHash }, keepalive),
  render: (kind: string, video?: string) => call<RenderState>('POST', '/api/render', { kind, video }),
  cancel: () => call<{ cancelled: boolean }>('POST', '/api/render/cancel', {}),
  reveal: (path: string, action: 'reveal' | 'open') => call('POST', '/api/reveal', { path, action }),
};

export function demoThumbUrl(demo: string, path: string, w = 480): string {
  return serverUrl(`/api/demo-thumb?demo=${encodeURIComponent(demo)}&path=${encodeURIComponent(path)}&t=1&w=${w}`);
}

export function thumbUrl(path: string, t: number, w = 160): string {
  return serverUrl(`/api/thumb?path=${encodeURIComponent(path)}&t=${t.toFixed(2)}&w=${w}`);
}
