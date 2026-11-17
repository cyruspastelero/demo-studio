import { describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';
import { fetchTemplates, formatDuration, originLabel, parseTemplates, sourceLine, type LookTemplate } from './templates';

const HOUSE: LookTemplate = {
  id: 'house', name: 'House', description: 'The default look.', created: '2026-11-18', origin: 'built-in',
  source: null, previews: ['/api/template-preview/built-in/house/01.png'], colours: { accent: '#FC5E32', background: '#111111' },
};

describe('templates client', () => {
  it('asks the local API with the studio header and keeps good entries only', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([
      HOUSE,
      { id: 'no-origin', name: 'x', previews: [] },
      null,
      { ...HOUSE, id: 'odd-previews', origin: 'workspace', previews: ['https://elsewhere.example/a.png', '/api/template-preview/workspace/odd-previews/01.png'] },
    ])));
    const list = await fetchTemplates(fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledWith('/api/templates', { headers: { 'x-studio': '1' } });
    expect(list.map((t) => t.id)).toEqual(['house', 'odd-previews']);
    expect(list[1].previews).toEqual(['/api/template-preview/workspace/odd-previews/01.png']);
  });

  it('throws on a failed request and treats a non-list as empty', async () => {
    const failing = vi.fn(async () => new Response('{}', { status: 500 }));
    await expect(fetchTemplates(failing as unknown as typeof fetch)).rejects.toThrow(/500/);
    expect(parseTemplates({ templates: [] })).toEqual([]);
  });

  it('writes the source line and the origin tag', () => {
    expect(sourceLine({ ...HOUSE, source: { file: 'reference.mp4', duration: 96 } })).toBe('Copied from reference.mp4, 1:36');
    expect(sourceLine({ ...HOUSE, source: { file: 'reference.mp4', duration: null } })).toBe('Copied from reference.mp4');
    expect(sourceLine(HOUSE)).toBeNull();
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(originLabel('built-in')).toBe('Built-in');
    expect(originLabel('workspace')).toBe('Yours');
  });
});

describe('copyText', () => {
  it('uses the async clipboard when it works', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('hello', {} as Document)).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    vi.unstubAllGlobals();
  });

  it('falls back to a hidden text area when the clipboard is refused', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    const area = { value: '', style: {}, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn() };
    const doc = {
      createElement: vi.fn(() => area), body: { appendChild: vi.fn() }, activeElement: null, execCommand: vi.fn(() => true),
    } as unknown as Document;
    expect(await copyText('hello', doc)).toBe(true);
    expect(area.value).toBe('hello');
    expect(area.remove).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
