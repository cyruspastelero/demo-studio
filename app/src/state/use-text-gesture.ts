// Drag, resize and arrow-key nudge for a text box on the preview. Shows the live position while the
// gesture runs and commits once when it ends, so each drag or key press is one undo step.
import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { TEXT_SIZE, type ShotPatch } from '../lib/edits';
import { nudge, snapText, type Guides, type Point, type TextVariant } from '../lib/text-layout';

const DRAG_START_PX = 3;
const SNAP_PX = 8;
const NO_GUIDES: Guides = { x: [], y: [] };
export const NUDGE_KEYS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

type Gesture =
  | { kind: 'move'; x: number; y: number; from: Point; moved: boolean }
  | { kind: 'resize'; x: number; from: number; width: number };

interface Options {
  variant: TextVariant;
  saved: Point;
  savedSize: number;
  frame: { W: number; H: number };
  span: { w: number; h: number }; // the frame's size on screen
  inner: RefObject<HTMLDivElement | null>;
  onCommit: (patch: ShotPatch) => void;
}

export function useTextGesture({ variant, saved, savedSize, frame, span, inner, onCommit }: Options) {
  const [live, setLive] = useState<{ pos: Point; size: number } | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);
  const gesture = useRef<Gesture | null>(null);

  const startMove = (e: PointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'move', x: e.clientX, y: e.clientY, from: saved, moved: false };
  };

  const startResize = (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'resize', x: e.clientX, from: savedSize, width: inner.current?.getBoundingClientRect().width ?? 1 };
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'resize') {
      // Centre-anchored, so the width grows on both sides: twice the pointer travel.
      const ratio = Math.max(0.1, (g.width + 2 * (e.clientX - g.x)) / g.width);
      setLive({ pos: saved, size: Math.round(Math.min(TEXT_SIZE.max, Math.max(TEXT_SIZE.min, g.from * ratio))) });
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_START_PX) return;
    g.moved = true;
    const rect = inner.current?.getBoundingClientRect();
    const box = rect ? { w: rect.width / span.w, h: rect.height / span.h } : { w: 0, h: 0 };
    const snapped = snapText([g.from[0] + dx / span.w, g.from[1] + dy / span.h], box, e.altKey ? 0 : SNAP_PX / Math.min(span.w, span.h), variant);
    setGuides(snapped.guides);
    setLive({ pos: snapped.pos, size: savedSize });
  };

  const end = () => {
    const g = gesture.current;
    gesture.current = null;
    setGuides(NO_GUIDES);
    if (live && g?.kind === 'resize' && live.size !== savedSize) onCommit({ textSize: live.size });
    if (live && g?.kind === 'move' && g.moved) onCommit({ textPos: live.pos });
    setLive(null);
  };

  // Holding an arrow repeats keydown; the move is saved on keyup (or when focus leaves mid-nudge).
  const nudgeKey = (e: KeyboardEvent<HTMLElement>): boolean => {
    const step = NUDGE_KEYS[e.key];
    if (!step) return false;
    const px = e.shiftKey ? 10 : 1;
    setLive((l) => ({ pos: nudge(l?.pos ?? saved, step[0] * px, step[1] * px, frame), size: savedSize }));
    return true;
  };
  const commitNudge = () => {
    if (!live || gesture.current) return;
    onCommit({ textPos: live.pos });
    setLive(null);
  };

  return { live, guides, startMove, startResize, move, end, nudgeKey, commitNudge };
}
