// On-screen text drawn over the preview: click to select, drag to move (snaps to the centre lines,
// the safe margins and the default spot; hold Alt to place freely), double-click or Enter to edit
// in place, arrow keys to nudge (Shift for 10 px), and the corner handle to resize.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { TEXT_SIZE, type ShotPatch } from '../lib/edits';
import { defaultTextPos, type Point, type TextVariant } from '../lib/text-layout';
import { useTextGesture } from '../state/use-text-gesture';
import { TextTools } from './text-tools';

export interface StageBox { scale: number; left: number; top: number }

interface Props {
  variant: TextVariant;
  text: string;
  pos?: Point;
  size?: number;
  frame: { W: number; H: number };
  box: StageBox;
  active: boolean;
  startEditing?: boolean; // a new text box opens straight into typing
  font?: string;
  onActivate: () => void;
  onDeactivate: () => void;
  onCommit: (patch: ShotPatch) => void;
  onCancelNew?: () => void;
}

const singleLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export function TextLayer(props: Props) {
  const { variant, text, pos, size, frame, box, active, font, onActivate, onDeactivate, onCommit } = props;
  const saved = pos ?? defaultTextPos(variant);
  const savedSize = size ?? TEXT_SIZE.default;
  const span = { w: frame.W * box.scale, h: frame.H * box.scale };
  const inner = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const g = useTextGesture({ variant, saved, savedSize, frame, span, inner, onCommit });
  const edit = useInlineEdit(props, saved, wrapper);

  const at = g.live?.pos ?? saved;
  const fontSize = g.live?.size ?? savedSize;
  // The toolbar sits above the box, so it needs the box's on-screen height.
  useLayoutEffect(() => {
    if (inner.current) setHeight(inner.current.getBoundingClientRect().height);
  }, [text, fontSize, box.scale, edit.editing, active]);
  useEffect(() => { if (active && !edit.editing) wrapper.current?.focus({ preventScroll: true }); }, [active, edit.editing]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (edit.editing || e.button !== 0) return;
    e.stopPropagation();
    g.startMove(e);
    onActivate();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (edit.editing) return;
    if (g.nudgeKey(e) || e.key === 'Enter' || e.key === 'Escape') e.stopPropagation();
    if (NAV_KEYS.has(e.key) || e.key === 'Enter') e.preventDefault();
    if (e.key === 'Enter') edit.start();
    if (e.key === 'Escape') onDeactivate();
  };

  const innerStyle: CSSProperties = {
    transform: `translate(-50%, -50%) scale(${box.scale})`,
    ['--s' as string]: box.scale,
    ...(variant === 'onscreen' ? { fontSize } : {}),
    ...(font ? { fontFamily: font } : {}),
  };
  return (
    <>
      {g.guides.x.map((x) => <div key={`x${x}`} className="snap-guide vertical" style={{ left: box.left + x * span.w, top: box.top, height: span.h }} />)}
      {g.guides.y.map((y) => <div key={`y${y}`} className="snap-guide horizontal" style={{ top: box.top + y * span.h, left: box.left, width: span.w }} />)}
      <div
        ref={wrapper} className={`text-layer${active ? ' active' : ''}${edit.editing ? ' editing' : ''}`}
        style={{ left: box.left + at[0] * span.w, top: box.top + at[1] * span.h }}
        role="group" tabIndex={active ? 0 : -1} onKeyDown={onKeyDown} onKeyUp={(e) => { if (NAV_KEYS.has(e.key)) g.commitNudge(); }}
        onBlur={g.commitNudge} data-testid="text-layer"
        aria-label={`On-screen text: ${text || 'new text'}. Drag to move, Enter to edit, arrow keys to nudge.`}
      >
        <div
          ref={inner} className={`text-box ${variant}`} style={innerStyle} data-testid="text-box"
          onPointerDown={onPointerDown} onPointerMove={g.move} onPointerUp={g.end} onPointerCancel={g.end}
          onDoubleClick={(e) => { e.stopPropagation(); onActivate(); edit.start(); }}
        >
          {edit.editing ? edit.field : text}
          {active && !edit.editing && variant === 'onscreen' && (
            <div className="resize-handle" onPointerDown={g.startResize} onPointerMove={g.move} onPointerUp={g.end}
              onPointerCancel={g.end} title="Drag to resize" data-testid="text-resize" />
          )}
        </div>
        {active && !edit.editing && !g.live && (
          <TextTools variant={variant} at={saved} size={savedSize} top={-height / 2 - 10} onEdit={edit.start} onCommit={onCommit}
            moved={Boolean(pos) || (variant === 'onscreen' && size !== undefined)} />
        )}
      </div>
    </>
  );
}

const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

// Typing in place. A finished flag makes Enter, Esc and the blur that follows them end the edit once:
// moving focus away blurs the field before React removes it, which would otherwise save a second time.
function useInlineEdit({ text, startEditing, onCommit, onCancelNew }: Props, saved: Point, wrapper: React.RefObject<HTMLDivElement | null>) {
  const [editing, setEditing] = useState(Boolean(startEditing));
  const field = useRef<HTMLSpanElement>(null);
  const finished = useRef(false);

  useLayoutEffect(() => {
    if (!editing || !field.current) return;
    finished.current = false;
    const el = field.current;
    el.textContent = text;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps -- seed the field once per edit

  const finish = (keep: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const next = singleLine(field.current?.textContent ?? '');
    setEditing(false);
    if (startEditing) {
      if (keep && next) onCommit({ text: next, textPos: saved });
      else onCancelNew?.();
    } else if (keep && next !== text) {
      // Emptied: the text is gone, so its place and size go with it.
      onCommit(next ? { text: next } : { text: '', textPos: null, textSize: null });
    }
    if (!startEditing) wrapper.current?.focus({ preventScroll: true });
  };

  const node = (
    <span
      ref={field} className="text-edit" contentEditable="plaintext-only" suppressContentEditableWarning
      role="textbox" aria-label="Edit on-screen text" data-testid="text-edit"
      onBlur={() => finish(true)} onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      }}
    />
  );
  return { editing, field: node, start: () => setEditing(true) };
}
