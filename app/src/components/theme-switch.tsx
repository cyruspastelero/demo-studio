import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { applyTheme, browserStore, readTheme, saveTheme, type ThemeChoice } from '../lib/theme';

const OPTIONS: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: 'System theme', icon: <Monitor size={14} /> },
  { value: 'light', label: 'Light theme', icon: <Sun size={14} /> },
  { value: 'dark', label: 'Dark theme', icon: <Moon size={14} /> },
];

// One choice for the whole page, so every switch on screen (sidebar and narrow-screen bar) stays in step.
let current: ThemeChoice = readTheme(browserStore());
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => current;

function setTheme(next: ThemeChoice) {
  current = next;
  applyTheme(document.documentElement, next);
  saveTheme(browserStore(), next);
  listeners.forEach((listener) => listener());
}

// System / Light / Dark as three small icon buttons in a well, the picked one on a chip (like .segmented).
export function ThemeSwitch({ className = '' }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, snapshot);
  return (
    <div className={`theme-switch ${className}`.trim()} role="radiogroup" aria-label="Theme" data-testid="theme-switch">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={choice === o.value} aria-label={o.label} title={o.label}
          data-testid={`theme-${o.value}`} onClick={() => setTheme(o.value)}>
          {o.icon}
        </button>
      ))}
    </div>
  );
}
