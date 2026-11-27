// One line of card text that can be edited where it is shown: hover shows it is editable, a
// double-click (or Enter when focused) types over it, Enter saves, Esc cancels, leaving it saves.
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

interface Props {
  value: string;
  placeholder: string;
  className: string;
  style?: CSSProperties;
  label: string; // what it is, for screen readers and the tooltip
  onCommit: (value: string) => void;
  testId?: string;
  startEditing?: boolean; // open straight into typing (a card picture was just double-clicked)
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export function EditableLine({ value, placeholder, className, style, label, onCommit, testId, startEditing }: Props) {
  const [editing, setEditing] = useState(Boolean(startEditing));
  const el = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    if (!editing || !el.current) return;
    done.current = false;
    el.current.textContent = value;
    el.current.focus();
    const range = document.createRange();
    range.selectNodeContents(el.current);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps -- seed once per edit

  const finish = (keep: boolean) => {
    if (done.current) return; // Enter or Esc, then the blur that follows: one save at most
    done.current = true;
    const next = oneLine(el.current?.textContent ?? '');
    setEditing(false);
    if (keep && next !== value) onCommit(next);
  };

  if (editing) {
    return (
      <div ref={el} className={`${className} editable-line editing`} style={style} contentEditable="plaintext-only"
        suppressContentEditableWarning role="textbox" aria-label={label} data-testid={testId && `${testId}-edit`}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        }} />
    );
  }
  return (
    <div className={`${className} editable-line${value ? '' : ' empty'}`} style={style} tabIndex={0} role="button"
      aria-label={`${label}: ${value || 'empty'}. Double-click or press Enter to edit.`} title={`Double-click to edit the ${label.toLowerCase()}`}
      data-testid={testId} onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setEditing(true); } }}>
      {value || placeholder}
    </div>
  );
}
