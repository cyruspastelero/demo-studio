// The Templates view's data: look templates from GET /api/templates, and the lines shown on a card.

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
  const res = await fetcher('/api/templates', { headers: { 'x-studio': '1' } });
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
