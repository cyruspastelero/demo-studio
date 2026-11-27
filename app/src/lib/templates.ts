// The Templates view's data: look templates from GET /api/templates, and the lines shown on a card.

import { serverUrl } from './static-demo';

export type TemplateOrigin = 'workspace' | 'built-in';

export interface LookTemplate {
  id: string;
  name: string;
  description: string;
  created: string | null;
  origin: TemplateOrigin;
  source: { file: string; duration: number | null } | null;
  previews: string[];
  colours: { accent: string | null; background: string | null };
}

const ORIGINS: TemplateOrigin[] = ['workspace', 'built-in'];

// Keeps only well-formed entries, so a half-written template.json cannot break the view.
export function parseTemplates(data: unknown): LookTemplate[] {
  if (!Array.isArray(data)) return [];
  return data.filter((t): t is LookTemplate => !!t && typeof t === 'object'
    && typeof t.id === 'string' && typeof t.name === 'string' && ORIGINS.includes(t.origin)
    && Array.isArray(t.previews))
    .map((t) => ({
      ...t,
      description: typeof t.description === 'string' ? t.description : '',
      previews: t.previews.filter((p) => typeof p === 'string' && p.startsWith('/api/template-preview/')),
      colours: { accent: t.colours?.accent ?? null, background: t.colours?.background ?? null },
    }));
}

export async function fetchTemplates(fetcher: typeof fetch = fetch): Promise<LookTemplate[]> {
  const res = await fetcher(serverUrl('/api/templates'), { headers: { 'x-studio': '1' } });
  if (!res.ok) throw new Error(`could not list templates (${res.status})`);
  return parseTemplates(await res.json());
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// "Copied from reference.mp4, 1:36", or null for a template made by hand.
export function sourceLine(template: LookTemplate): string | null {
  if (!template.source) return null;
  const { file, duration } = template.source;
  return duration === null ? `Copied from ${file}` : `Copied from ${file}, ${formatDuration(duration)}`;
}

export function originLabel(origin: TemplateOrigin): string {
  return origin === 'built-in' ? 'Built-in' : 'Yours';
}

// A launch-ad style (motion-templates/<id>/): the ads made with render-motion.mjs.
export interface AdStyle {
  id: string;
  name: string;
  description: string;
  bestFor: string[];
  tone: 'light' | 'dark';
  previews: string[];
  sample: { label: string; url: string } | null;
}

export function parseAdStyles(data: unknown): AdStyle[] {
  if (!Array.isArray(data)) return [];
  return data.filter((s): s is AdStyle => !!s && typeof s === 'object' && typeof s.id === 'string' && typeof s.name === 'string'
    && Array.isArray(s.previews))
    .map((s) => ({
      ...s,
      description: typeof s.description === 'string' ? s.description : '',
      bestFor: Array.isArray(s.bestFor) ? s.bestFor.filter((t: unknown) => typeof t === 'string') : [],
      previews: s.previews.filter((p: unknown) => typeof p === 'string' && p.startsWith('/api/ad-style-preview/')),
      // Only the samples release, never another address from a file.
      sample: s.sample && typeof s.sample.url === 'string' && s.sample.url.startsWith('https://github.com/cyruspastelero/demo-studio/releases/download/samples/')
        ? { label: String(s.sample.label), url: s.sample.url } : null,
    }));
}

export async function fetchAdStyles(fetcher: typeof fetch = fetch): Promise<AdStyle[]> {
  const res = await fetcher(serverUrl('/api/ad-styles'), { headers: { 'x-studio': '1' } });
  if (!res.ok) throw new Error(`could not list the launch-ad styles (${res.status})`);
  return parseAdStyles(await res.json());
}
