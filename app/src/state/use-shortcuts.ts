import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  toggle: () => void;
  play: () => void;
  pause: () => void;
  seekBy: (seconds: number) => void;
  step: (frames: number) => void;
  home: () => void;
  end: () => void;
  loop: () => void;
  split: () => void;
  remove: () => void;
  undo: () => void;
  redo: () => void;
  zoom: (factor: number) => void;
  aspect: (index: number) => void;
  help: () => void;
  escape: () => void;
  markIn: () => void;
}

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function useShortcuts(handlers: ShortcutHandlers, enabled: boolean) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        // Text fields keep their own undo.
        if (typing(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) h.redo();
        else h.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y' && !typing(e.target)) {
        e.preventDefault();
        h.redo();
        return;
      }
      if (mod || e.altKey || typing(e.target)) return;
      const actions: Record<string, () => void> = {
        ' ': h.toggle,
        j: () => h.seekBy(-1),
        k: h.pause,
        l: h.play,
        ArrowLeft: () => (e.shiftKey ? h.seekBy(-1) : h.step(-1)),
        ArrowRight: () => (e.shiftKey ? h.seekBy(1) : h.step(1)),
        Home: h.home,
        End: h.end,
        o: h.loop,
        s: h.split,
        Delete: h.remove,
        Backspace: h.remove,
        '=': () => h.zoom(1.25),
        '+': () => h.zoom(1.25),
        '-': () => h.zoom(0.8),
        1: () => h.aspect(0),
        2: () => h.aspect(1),
        3: () => h.aspect(2),
        '?': h.help,
        Escape: h.escape,
        i: h.markIn,
      };
      const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key] ?? actions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
