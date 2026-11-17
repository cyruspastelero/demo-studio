// Light, dark or system. The choice lives in this browser only (localStorage) and is set on <html> as
// data-theme="system|light|dark"; styles.css maps "system" to the device setting with a media query, so a
// device switch is followed live without any script. index.html applies the stored choice before first paint
// (keep THEME_KEY in step with the inline script there).

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_KEY = 'demo-studio.theme';
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export function normaliseTheme(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

// Storage can be missing or throw (private windows, blocked site data): fall back to "system".
export function readTheme(store: Store | undefined): ThemeChoice {
  try {
    return normaliseTheme(store?.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

// Returns false when the choice could not be kept; the theme still applies for this visit.
export function saveTheme(store: Store | undefined, choice: ThemeChoice): boolean {
  try {
    if (!store) return false;
    store.setItem(THEME_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

export function applyTheme(root: { dataset: DOMStringMap }, choice: ThemeChoice): void {
  root.dataset.theme = choice;
}

export function browserStore(): Store | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
