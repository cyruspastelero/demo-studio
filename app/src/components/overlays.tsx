import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} data-testid="toast">
          <span>{t.message}</span>
          <button aria-label="Dismiss" onClick={() => onDismiss(t.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export function Modal({ title, children, onClose, className = '' }: {
  title: string; children: ReactNode; onClose?: () => void; className?: string;
}) {
  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['Space'], 'Play or pause'],
  [['J'], 'Back 1 second'],
  [['K'], 'Pause'],
  [['L'], 'Play'],
  [['Left'], 'Back one frame'],
  [['Right'], 'Forward one frame'],
  [['Shift', 'Left'], 'Back 1 second'],
  [['Shift', 'Right'], 'Forward 1 second'],
  [['Home'], 'Go to the start'],
  [['End'], 'Go to the end'],
  [['O'], 'Loop the selected shot'],
  [['S'], 'Split the shot at the playhead'],
  [['Delete'], 'Remove the selected shot'],
  [['Cmd', 'Z'], 'Undo'],
  [['Cmd', 'Shift', 'Z'], 'Redo'],
  [['='], 'Zoom the timeline in'],
  [['-'], 'Zoom the timeline out'],
  [['1'], '16:9 frame'],
  [['2'], '4:5 frame'],
  [['3'], '9:16 frame'],
  [['?'], 'Show this list'],
];

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} className="shortcuts">
      <div className="shortcut-grid">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label + keys.join()} className="shortcut">
            <span>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="field-note shortcut-note">Ctrl works in place of Cmd on Linux and Windows.</p>
      <div className="actions"><button className="btn" onClick={onClose}>Close</button></div>
    </Modal>
  );
}
