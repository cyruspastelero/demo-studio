// The small toolbar above a selected text box: edit, size (on-screen text only), centre, reset.
import { AlignCenterHorizontal, AlignCenterVertical, Minus, Pencil, Plus, RotateCcw } from 'lucide-react';
import { TEXT_SIZE, type ShotPatch } from '../lib/edits';
import type { Point, TextVariant } from '../lib/text-layout';

interface Props {
  variant: TextVariant;
  at: Point;
  size: number;
  moved: boolean;
  top: number;
  onEdit: () => void;
  onCommit: (patch: ShotPatch) => void;
}

export function TextTools({ variant, at, size, moved, top, onEdit, onCommit }: Props) {
  return (
    <div className="text-tools" role="toolbar" aria-label="Text" style={{ top }} onPointerDown={(e) => e.stopPropagation()} data-testid="text-tools">
      <button className="icon-btn" title="Edit text (Enter)" aria-label="Edit text" onClick={onEdit}><Pencil size={14} /></button>
      {variant === 'onscreen' && (
        <>
          <button className="icon-btn" title="Smaller" aria-label="Smaller text" disabled={size <= TEXT_SIZE.min}
            onClick={() => onCommit({ textSize: size - 4 })}><Minus size={14} /></button>
          <span className="mono size" data-testid="text-size">{size}px</span>
          <button className="icon-btn" title="Larger" aria-label="Larger text" disabled={size >= TEXT_SIZE.max}
            onClick={() => onCommit({ textSize: size + 4 })}><Plus size={14} /></button>
        </>
      )}
      <span className="sep" />
      <button className="icon-btn" title="Centre across" aria-label="Centre across" onClick={() => onCommit({ textPos: [0.5, at[1]] })}><AlignCenterVertical size={14} /></button>
      <button className="icon-btn" title="Centre down" aria-label="Centre down" onClick={() => onCommit({ textPos: [at[0], 0.5] })}><AlignCenterHorizontal size={14} /></button>
      <button className="icon-btn" title="Back to the default spot" aria-label="Reset position" disabled={!moved} data-testid="text-reset"
        onClick={() => onCommit({ textPos: null, ...(variant === 'onscreen' ? { textSize: null } : {}) })}><RotateCcw size={14} /></button>
    </div>
  );
}
