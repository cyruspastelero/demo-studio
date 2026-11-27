import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { voiceoverFits } from './fit';
import { REPO, runPython } from './python';
import {
  buildDemoTimeline, buildHandoffTimeline, RefError, resolveRef, shotAt, snap, sourceTime, tickLabel, timecode, timelineTime,
} from './timeline';
import type { DemoDoc, HandoffDoc, MediaIndex } from './types';

const example = (name: string) => JSON.parse(readFileSync(join(REPO, 'examples/acme-invoice-bot', name), 'utf8'));

interface PyVideo {
  key: string;
  lengths: number[];
  starts: Record<string, number>;
  total: number;
  problems: string[];
}

// build-handoff.py's own model of the same config, with the words-per-minute fit check.
function pythonModel(cfg: unknown): PyVideo[] {
  return runPython<PyVideo[]>(`
bh = load("bh", "build-handoff.py")
cfg = json.load(sys.stdin)
out = []
for v in bh.build_videos(cfg):
    starts = bh.scene_starts(v)
    total = sum(s.length for s in v.shots)
    narrated = [s for s in v.scenes if s in v.voiceover]
    voice = cfg.get("voice", {})
    lead = voice.get("lead_in", bh.DEFAULT_LEAD_IN)
    problems = []
    for i, name in enumerate(narrated):
        start = starts[name] + lead
        limit = (starts[narrated[i + 1]] if i + 1 < len(narrated) else total) - start
        seconds, _ = bh.spoken_length(v.voiceover[name], None, "", voice, False)
        if seconds > limit:
            problems.append(name)
    out.append({"key": v.key, "lengths": [s.length for s in v.shots],
                "starts": {k: s for k, s in starts.items()}, "total": total, "problems": problems})
print(json.dumps(out))
`, cfg);
}

describe('handoff timeline math', () => {
  it('matches build-handoff.py shot lengths, scene starts and totals for the example', () => {
    const doc = example('handoff.json') as HandoffDoc;
    const py = pythonModel(doc);
    py.forEach((video, index) => {
      const tl = buildHandoffTimeline(doc, index);
      expect(tl.shots.map((s) => s.length)).toEqual(video.lengths.map((n) => expect.closeTo(n, 9)));
      tl.scenes.forEach((scene) => {
        expect(scene.start).toBeCloseTo(video.starts[`${scene.index + 1} ${scene.name}`], 9);
      });
      expect(tl.total).toBeCloseTo(video.total, 9);
    });
  });

  it('applies speed: a 1.5x shot of 8 source seconds lasts 5.33 seconds', () => {
    const doc = example('handoff.json') as HandoffDoc;
    const thread = buildHandoffTimeline(doc, 0).shots[1];
    expect(thread.ref).toBe('THREAD');
    expect(thread.length).toBeCloseTo(8 / 1.5, 9);
    expect(thread.start).toBe(2.5);
  });

  it('maps timeline time to source time and back', () => {
    const tl = buildHandoffTimeline(example('handoff.json') as HandoffDoc, 0);
    const shot = tl.shots[1];
    expect(sourceTime(shot, shot.start + 2)).toBeCloseTo(shot.in + 3, 9);
    expect(timelineTime(shot, shot.in + 3)).toBeCloseTo(shot.start + 2, 9);
    expect(shotAt(tl, shot.start + 0.01)?.id).toBe(shot.id);
    expect(shotAt(tl, tl.total + 5)?.id).toBe(tl.shots[tl.shots.length - 1].id);
  });

  it('uses media paths from the index and cards from the cards folder', () => {
    const media: MediaIndex = {
      raw: [{ file: '01-the-thread-t1.mp4', path: 'takes/01-the-thread-t1.mp4', duration: 12 }],
      cards: { 'card-open': 'out/card-open.png' }, keynoteCards: {},
    };
    const tl = buildHandoffTimeline(example('handoff.json') as HandoffDoc, 0, media);
    expect(tl.shots[0].cardPng).toBe('out/card-open.png');
    expect(tl.shots[1].mediaPath).toBe('takes/01-the-thread-t1.mp4');
    expect(tl.shots[2].mediaPath).toBe('recordings/raw/04-ask-bot-t2.mp4');
  });
});

describe('demo.json timeline', () => {
  it('uses card durations, trims and speed like build-keynote.py, with the end card\'s outro', () => {
    const doc = example('demo.json') as DemoDoc;
    const media: MediaIndex = { raw: [{ file: '05-approve-t1.mp4', path: 'recordings/raw/05-approve-t1.mp4', duration: 7 }], cards: {}, keynoteCards: {} };
    const tl = buildDemoTimeline(doc, media);
    // The last card is the end card: its 3.8 s plus the 5 s brand sweep and logo outro.
    expect(tl.shots.map((s) => Number(s.length.toFixed(4)))).toEqual([3.2, Number((8 / 1.5).toFixed(4)), 2.4, Number((10.5 / 1.25).toFixed(4)), 7, 8.2, 8.8]);
    expect(tl.rateWpm).toBe(150);
    expect(tl.leadIn).toBe(0.5);
  });

  it('times cards without a duration by kind, like build-keynote.py\'s card_kind', () => {
    const doc: DemoDoc = { title: 'T', sequence: [
      { card: 'open', title: 'Open', subtitle: 'With a subtitle' }, // hero 3.0
      { card: 'part', title: 'Part one' }, // section 2.4
      { card: 'forced', title: 'Forced', subtitle: 'Sub', kind: 'section' }, // kind wins: 2.4
      { card: 'end', title: 'The end', subtitle: 'example.com' }, // last: end 7.9 + outro 5.0
    ] };
    expect(buildDemoTimeline(doc).shots.map((s) => Number(s.length.toFixed(4)))).toEqual([3, 2.4, 2.4, 12.9]);
    const noOutro = { ...doc, sequence: [...doc.sequence.slice(0, 3), { card: 'end', title: 'The end', outro: 0 }] };
    expect(buildDemoTimeline(noOutro).total).toBeCloseTo(3 + 2.4 + 2.4 + 7.9);
    // A one-item sequence has no end card (build_plan's index > 0).
    expect(buildDemoTimeline({ title: 'T', sequence: [{ card: 'only', title: 'Only' }] }).total).toBe(2.4);
  });

  it('shows the first callout\'s text, position and font on a scene with callouts, like the keynote render', () => {
    const doc: DemoDoc = { title: 'T', sequence: [{ scene: '01', stem: '01-x', take: 1, caption: 'Ignored',
      callouts: [{ at: 0.5, dur: 3, text: 'First pill', pos: [0.4, 0.7], font: 'geist' }, { at: 4, text: 'Second' }] }] };
    const [shot] = buildDemoTimeline(doc).shots;
    expect(shot).toMatchObject({ text: 'First pill', textPos: [0.4, 0.7], textFont: 'geist' });
  });
});

describe('voiceover fit', () => {
  it('flags the same lines as build-handoff.py', () => {
    const doc = example('handoff.json') as HandoffDoc;
    const py = pythonModel(doc);
    py.forEach((video, index) => {
      const tl = buildHandoffTimeline(doc, index);
      const bad = voiceoverFits(tl).filter((f) => !f.fits).map((f) => `${f.sceneIndex + 1} ${tl.scenes[f.sceneIndex].name}`);
      expect(bad).toEqual(video.problems);
    });
  });

  it('turns a line red when it runs past the next narrated scene', () => {
    const doc = example('handoff.json') as HandoffDoc;
    const long = structuredClone(doc);
    long.videos[0].scenes[2].voiceover = 'word '.repeat(40).trim();
    const py = pythonModel(long);
    const fits = voiceoverFits(buildHandoffTimeline(long, 0));
    const approve = fits.find((f) => f.sceneIndex === 2);
    expect(approve?.fits).toBe(false);
    expect(approve?.seconds).toBeCloseTo((40 / 165) * 60, 9);
    expect(py[0].problems).toEqual(['3 Approve']);
  });

  it('measures the last line against the end of the video', () => {
    const tl = buildHandoffTimeline(example('handoff.json') as HandoffDoc, 0);
    const last = voiceoverFits(tl).at(-1);
    const scene = tl.scenes.at(-1);
    expect(last?.available).toBeCloseTo(tl.total - (scene?.start ?? 0) - 0.3, 9);
  });
});

describe('ref resolution', () => {
  const named = { A: { source: 'a.mp4', in: 1, out: 5, speed: 2, screen: 'shared', text: 'T' } };

  it('lays the shot fields over the named shot', () => {
    expect(resolveRef({ ref: 'A', speed: 1, text: 'own' }, named)).toEqual({ source: 'a.mp4', in: 1, out: 5, speed: 1, screen: 'shared', text: 'own' });
    expect(resolveRef({ ref: 'A' }, named)).toEqual(named.A);
  });

  it('rejects unknown names', () => {
    expect(() => resolveRef({ ref: 'NOPE' }, named)).toThrow(RefError);
  });

  it('resolves the HOW-TO override of THREAD at 1.25x', () => {
    const tl = buildHandoffTimeline(example('handoff.json') as HandoffDoc, 1);
    const thread = tl.shots.find((s) => s.ref === 'THREAD');
    expect(thread?.speed).toBe(1.25);
    expect(thread?.length).toBeCloseTo(8 / 1.25, 9);
  });
});

describe('helpers', () => {
  it('formats timecodes as m:ss.cc', () => {
    expect(timecode(0)).toBe('0:00.00');
    expect(timecode(65.255)).toBe('1:05.26');
  });

  it('keeps the half second in ruler labels past one minute', () => {
    expect(tickLabel(30, 1)).toBe('30s');
    expect(tickLabel(0.5, 0.5)).toBe('0.5s');
    expect(tickLabel(60.5, 0.5)).toBe('1:00.5');
    expect(tickLabel(119.5, 0.5)).toBe('1:59.5');
    expect(tickLabel(120, 0.5)).toBe('2:00.0');
    expect(tickLabel(90, 5)).toBe('1:30');
  });

  it('snaps to the nearest edge inside the tolerance', () => {
    expect(snap(4.05, [0, 4, 8], 0.1)).toBe(4);
    expect(snap(4.5, [0, 4, 8], 0.1)).toBe(4.5);
  });
});
