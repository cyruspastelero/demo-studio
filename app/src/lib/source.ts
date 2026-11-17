// The raw take source viewer: what the media bin and the viewer share, kept free of React so it can
// be tested on its own.
import type { ShotPatch } from './edits';
import { FPS } from './player';
import type { MediaInfo, TimelineShot } from './types';

// A press that moves less than this (in CSS pixels) is a click, not the start of a drag.
export const CLICK_SLOP = 4;
// Same floor as edits.ts: a shot is at least this long in source seconds.
const MIN_LENGTH = 0.1;

export interface SourceTake {
  file: string;
  path: string; // relative to the demo folder, for /media/
  duration: number | null;
  status?: string;
}

export interface SourceControls {
  toggle: () => void;
  play: () => void;
  pause: () => void;
  seekBy: (seconds: number) => void;
  step: (frames: number) => void;
  home: () => void;
  end: () => void;
  time: () => number;
}

export type Mark = 'in' | 'out';

export function takeOf(m: MediaInfo): SourceTake {
  return { file: m.file, path: m.path, duration: m.duration, status: m.status };
}

export function isClick(down: { x: number; y: number } | null, up: { x: number; y: number }): boolean {
  if (!down) return true;
  return Math.hypot(up.x - down.x, up.y - down.y) < CLICK_SLOP;
}

export function clampSource(time: number, duration: number | null): number {
  const low = Math.max(0, time);
  return duration == null ? low : Math.min(low, duration);
}

export function stepSource(time: number, frames: number, duration: number | null): number {
  return clampSource(time + frames / FPS, duration);
}

export function sourceLabel(take: Pick<SourceTake, 'file' | 'status'>): string[] {
  return ['Raw take', take.file, ...(take.status ? [take.status] : [])];
}

// The selected timeline shot that Set in / Set out would change, if it plays this take.
export function markTarget(selected: TimelineShot | undefined, file: string): TimelineShot | undefined {
  return selected?.kind === 'clip' && selected.file === file ? selected : undefined;
}

const hundredths = (n: number) => Math.round(n * 100) / 100;

export function markPatch(shot: TimelineShot, mark: Mark, time: number): { patch: ShotPatch } | { error: string } {
  const t = hundredths(Math.max(0, time));
  if (mark === 'in' && t > shot.out - MIN_LENGTH) {
    return { error: `The in point must be before the shot's out point (${shot.out.toFixed(2)}s).` };
  }
  if (mark === 'out' && t < shot.in + MIN_LENGTH) {
    return { error: `The out point must be after the shot's in point (${shot.in.toFixed(2)}s).` };
  }
  return { patch: mark === 'in' ? { in: t } : { out: t } };
}
