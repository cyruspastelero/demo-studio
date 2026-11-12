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
  const res = await fetch(path, {
    method,
    headers: body === undefined ? { 'x-studio': '1' } : { 'content-type': 'application/json', 'x-studio': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `${method} ${path} failed (${res.status})`, res.status, data);
  return data as T;
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
  return `/api/demo-thumb?demo=${encodeURIComponent(demo)}&path=${encodeURIComponent(path)}&t=1&w=${w}`;
}

export function thumbUrl(path: string, t: number, w = 160): string {
  return `/api/thumb?path=${encodeURIComponent(path)}&t=${t.toFixed(2)}&w=${w}`;
}
