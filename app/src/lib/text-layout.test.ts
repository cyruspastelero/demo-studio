import { describe, expect, it } from 'vitest';
import { defaultTextPos, keepInside, nudge, snapText, textVariant } from './text-layout';

const box = { w: 0.2, h: 0.06 }; // text box size as frame fractions

describe('text layout', () => {
  it('puts handoff text low and centred, and demo pills where the keynote render puts them', () => {
    expect(defaultTextPos('onscreen')).toEqual([0.5, 0.88]);
    expect(defaultTextPos('pill')).toEqual([0.5, 962 / 1080]);
  });

  it('picks the pill for demo clips and the on-screen box for handoff shots', () => {
    expect(textVariant('demo', 'clip')).toBe('pill');
    expect(textVariant('demo', 'card')).toBeNull();
    expect(textVariant('handoff', 'card')).toBe('onscreen');
  });

  it('snaps the centre to the frame centre lines when close', () => {
    const { pos, guides } = snapText([0.505, 0.497], box, 0.01, 'onscreen');
    expect(pos).toEqual([0.5, 0.5]);
    expect(guides).toEqual({ x: [0.5], y: [0.5] });
  });

  it('snaps box edges to the 5% safe margin', () => {
    const { pos, guides } = snapText([0.157, 0.3], box, 0.01, 'onscreen');
    expect(pos[0]).toBeCloseTo(0.15);
    expect(guides.x).toEqual([0.05]);
  });

  it('snaps back to the default spot', () => {
    const { pos } = snapText([0.5, 0.875], box, 0.01, 'onscreen');
    expect(pos).toEqual([0.5, 0.88]);
  });

  it('leaves a far-away point alone and keeps the box inside the frame', () => {
    expect(snapText([0.3, 0.3], box, 0.01, 'onscreen')).toEqual({ pos: [0.3, 0.3], guides: { x: [], y: [] } });
    expect(snapText([0.99, 0.01], box, 0, 'onscreen').pos).toEqual([0.9, 0.03]);
  });

  it('pushes a box that grew past an edge back inside the frame', () => {
    expect(keepInside([0.1, 0.5], { w: 0.4, h: 0.1 })).toEqual([0.2, 0.5]);
    expect(keepInside([0.95, 0.98], { w: 0.2, h: 0.1 })).toEqual([0.9, 0.95]);
    expect(keepInside([0.3, 0.3], { w: 0.2, h: 0.1 })).toEqual([0.3, 0.3]);
    expect(keepInside([0.1, 0.5], { w: 1.2, h: 0.1 })).toEqual([0.5, 0.5]); // wider than the frame: centre it
  });

  it('nudges by frame pixels and stays inside the frame', () => {
    const [x, y] = nudge([0.5, 0.5], 10, -20, { W: 1000, H: 500 });
    expect(x).toBeCloseTo(0.51);
    expect(y).toBeCloseTo(0.46);
    expect(nudge([1, 0], 50, -50, { W: 1000, H: 500 })).toEqual([1, 0]);
  });
});
