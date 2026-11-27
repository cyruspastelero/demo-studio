// Where on-screen text sits in the preview, and how it snaps while dragged. Positions are the
// text's centre as fractions of the frame, the same numbers saved in text_pos / caption_pos.
import type { FileKind } from './types';

export type TextVariant = 'onscreen' | 'pill';
export type Point = [number, number];
export interface Guides { x: number[]; y: number[] }

const SAFE = 0.05; // action-safe margin
// keynote-page.mjs: the pill is centred at y 962 in a 1920x1080 frame.
const DEFAULTS: Record<TextVariant, Point> = { onscreen: [0.5, 0.88], pill: [0.5, 962 / 1080] };

export function defaultTextPos(variant: TextVariant): Point {
  return DEFAULTS[variant];
}

// demo.json captions become pills on scene clips; handoff text is a note for the editor on any shot.
export function textVariant(kind: FileKind, shotKind: 'clip' | 'card'): TextVariant | null {
  if (kind === 'demo') return shotKind === 'clip' ? 'pill' : null;
  return 'onscreen';
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Snap the centre to the centre lines and the default spot, and the box edges to the safe margins.
export function snapText(point: Point, box: { w: number; h: number }, threshold: number, variant: TextVariant): { pos: Point; guides: Guides } {
  const guides: Guides = { x: [], y: [] };
  const axis = (value: number, half: number, centres: number[], which: 'x' | 'y') => {
    const candidates: [number, number][] = [
      ...centres.map((c): [number, number] => [c, c]),
      [SAFE + half, SAFE], [1 - SAFE - half, 1 - SAFE],
    ];
    let best: [number, number] | null = null;
    for (const [target, line] of candidates) {
      const d = Math.abs(value - target);
      if (d <= threshold && (!best || d < Math.abs(value - best[0]))) best = [target, line];
    }
    if (best) guides[which].push(best[1]);
    return clamp(best ? best[0] : value, Math.min(half, 0.5), Math.max(1 - half, 0.5));
  };
  const [dx, dy] = defaultTextPos(variant);
  const x = axis(point[0], box.w / 2, [0.5, dx].filter(unique), 'x');
  const y = axis(point[1], box.h / 2, [0.5, dy].filter(unique), 'y');
  return { pos: [x, y], guides };
}

function unique(value: number, index: number, list: number[]) {
  return list.indexOf(value) === index;
}

export function nudge(point: Point, dxPx: number, dyPx: number, frame: { W: number; H: number }): Point {
  return [clamp(point[0] + dxPx / frame.W, 0, 1), clamp(point[1] + dyPx / frame.H, 0, 1)];
}
