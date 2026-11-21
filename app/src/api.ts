import { STATIC_DEMO, STATIC_DEMO_NOTICE, serverUrl } from './lib/static-demo';
import type { FileKind, MediaIndex } from './lib/types';

export interface FileState {
  name: string;
  text: string;
  hash: string;
  data: unknown;
  errors: string[];
}

export interface OutputFile {
  path: string;
  rel: string | null;
  isDir: boolean;
}

export interface RenderState {
  id: number;
  kind: string;
  label: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  progress: { stage: string; done: number; total: number } | null;
  outputs: string[];
  outputFiles?: OutputFile[];
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
    mode: 'editor'; repo: string; folder: string; name: string; platform: string;
    files: Record<FileKind, FileState | null>; render: RenderState | null;
  };

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (STATIC_DEMO) return staticCall<T>(method, path);
  const res = await fetch(path, {
    method,
    headers: body === undefined ? { 'x-studio': '1' } : { 'content-type': 'application/json', 'x-studio': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `${method} ${path} failed (${res.status})`, res.status, data);
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
  media: () => call<MediaIndex>('GET', '/api/media'),
  save: (kind: FileKind, data: unknown, baseHash: string | null) =>
    call<{ hash: string }>('PUT', `/api/file/${kind}`, { data, baseHash }),
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
