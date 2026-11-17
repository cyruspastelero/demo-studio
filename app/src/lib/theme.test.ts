import { describe, expect, it } from 'vitest';
import { applyTheme, normaliseTheme, readTheme, saveTheme, THEME_KEY } from './theme';

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

const throwing = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
};

describe('theme choice', () => {
  it('treats anything but light or dark as system', () => {
    expect(normaliseTheme('dark')).toBe('dark');
    expect(normaliseTheme('light')).toBe('light');
    expect(normaliseTheme('purple')).toBe('system');
    expect(normaliseTheme(null)).toBe('system');
  });

  it('defaults to system when nothing is stored', () => {
    expect(readTheme(memoryStore())).toBe('system');
    expect(readTheme(undefined)).toBe('system');
  });

  it('keeps a saved choice and reads it back', () => {
    const store = memoryStore();
    expect(saveTheme(store, 'dark')).toBe(true);
    expect(store.data.get(THEME_KEY)).toBe('dark');
    expect(readTheme(store)).toBe('dark');
  });

  it('survives storage that throws', () => {
    expect(readTheme(throwing)).toBe('system');
    expect(saveTheme(throwing, 'light')).toBe(false);
  });

  it('sets data-theme on the root', () => {
    const root = { dataset: {} as DOMStringMap };
    applyTheme(root, 'light');
    expect(root.dataset.theme).toBe('light');
  });
});
