import { describe, expect, it } from 'vitest';
import { clampSource, isClick, markPatch, markTarget, sourceLabel, stepSource } from './source';
import type { TimelineShot } from './types';

const clip = (over: Partial<TimelineShot> = {}): TimelineShot => ({
  id: '0:0:0', sceneIndex: 0, shotIndex: 0, kind: 'clip', file: '01-dashboard-t1.mp4', mediaPath: 'recordings/raw/01-dashboard-t1.mp4',
  in: 1, out: 4, speed: 1, length: 3, start: 0, screen: 'Dashboard', text: '', ...over,
});

describe('raw take source viewer', () => {
  it('treats a press that barely moved as a click and a longer move as a drag', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(true);
    expect(isClick({ x: 10, y: 10 }, { x: 30, y: 10 })).toBe(false);
    expect(isClick(null, { x: 30, y: 10 })).toBe(true);
  });

  it('keeps the source time inside the take', () => {
    expect(clampSource(-1, 5)).toBe(0);
    expect(clampSource(9, 5)).toBe(5);
    expect(clampSource(2, 5)).toBe(2);
    expect(clampSource(2, null)).toBe(2);
  });

  it('steps one frame at 30 fps and stops at the ends', () => {
    expect(stepSource(1, 1, 5)).toBeCloseTo(1 + 1 / 30);
    expect(stepSource(0, -1, 5)).toBe(0);
    expect(stepSource(5, 1, 5)).toBe(5);
  });

  it('labels the take with its review status when it has one', () => {
    expect(sourceLabel({ file: '01-dashboard-t1.mp4', status: 'KEEP' })).toEqual(['Raw take', '01-dashboard-t1.mp4', 'KEEP']);
    expect(sourceLabel({ file: 'a.mp4' })).toEqual(['Raw take', 'a.mp4']);
  });

  it('offers set in and out only for a selected clip that uses the open take', () => {
    expect(markTarget(clip(), '01-dashboard-t1.mp4')?.id).toBe('0:0:0');
    expect(markTarget(clip(), 'other.mp4')).toBeUndefined();
    expect(markTarget(clip({ kind: 'card', file: undefined }), '01-dashboard-t1.mp4')).toBeUndefined();
    expect(markTarget(undefined, '01-dashboard-t1.mp4')).toBeUndefined();
  });

  it('sets the in or out point to the source time, rounded to hundredths', () => {
    expect(markPatch(clip(), 'in', 2.3456)).toEqual({ patch: { in: 2.35 } });
    expect(markPatch(clip(), 'out', 3.001)).toEqual({ patch: { out: 3 } });
  });

  it('refuses an in point after the out point and an out point before the in point', () => {
    expect(markPatch(clip(), 'in', 3.95)).toHaveProperty('error');
    expect(markPatch(clip(), 'out', 1.05)).toHaveProperty('error');
  });
});
