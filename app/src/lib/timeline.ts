// Timeline math. Mirrors build-handoff.py (Shot.length, scene_starts) for handoff.json and
// build-keynote.py / keynote-handoff.py for demo.json, so the preview times match the renders.
import type {
  CardShotSpec, ClipSpec, DemoCardItem, DemoDoc, DemoSceneItem, HandoffDoc, MediaIndex,
  RefShotSpec, ShotSpec, Timeline, TimelineScene, TimelineShot,
} from './types';

export const HANDOFF_RATE_WPM = 165;
export const HANDOFF_LEAD_IN = 0.3;
// keynote-handoff.py: WPS = 2.5, VO_LEAD = 0.5
export const KEYNOTE_RATE_WPM = 150;
export const KEYNOTE_LEAD_IN = 0.5;
export const KEYNOTE_CARD_DEFAULT = 2.4;
export const DEFAULT_RAW_DIR = 'recordings/raw';

export const isCardShot = (s: ShotSpec): s is CardShotSpec => 'card' in s;
export const isRefShot = (s: ShotSpec): s is RefShotSpec => 'ref' in s;
export const isDemoCard = (i: DemoCardItem | DemoSceneItem): i is DemoCardItem => 'card' in i;

export function shotLength(start: number, end: number, speed: number): number {
  return (end - start) / speed;
}

export class RefError extends Error {}

// A {ref} shot is the named shot with this shot's own fields laid over it.
export function resolveRef(spec: RefShotSpec, named: Record<string, ClipSpec> | undefined): ClipSpec {
  const base = named?.[spec.ref];
  if (!base) throw new RefError(`unknown shot ref '${spec.ref}'`);
  const { ref: _ref, ...overrides } = spec;
  return { ...base, ...overrides };
}

export function rawDir(doc: HandoffDoc): string {
  return (doc.paths?.raw ?? DEFAULT_RAW_DIR).replace(/\/+$/, '');
}

function mediaFor(media: MediaIndex | undefined, file: string) {
  return media?.raw.find((m) => m.file === file);
}

export function buildHandoffTimeline(doc: HandoffDoc, videoIndex: number, media?: MediaIndex): Timeline {
  const video = doc.videos[videoIndex];
  const scenes: TimelineScene[] = [];
  const shots: TimelineShot[] = [];
  let clock = 0;
  video?.scenes.forEach((scene, sceneIndex) => {
    const sceneShots: TimelineShot[] = [];
    const sceneStart = clock;
    scene.shots.forEach((spec, shotIndex) => {
      const id = `${videoIndex}:${sceneIndex}:${shotIndex}`;
      let shot: TimelineShot;
      if (isCardShot(spec)) {
        const text = doc.cards?.[spec.card];
        shot = {
          id, sceneIndex, shotIndex, kind: 'card', card: spec.card, cardTitle: text?.title,
          cardSubtitle: text?.subtitle, cardPng: media?.cards[spec.card],
          in: 0, out: spec.length, speed: 1, length: spec.length, start: clock,
          screen: spec.screen ?? 'Title card placeholder', text: spec.text ?? '',
          textPos: spec.text_pos, textSize: spec.text_size, textFont: spec.text_font,
        };
      } else {
        const clip = isRefShot(spec) ? resolveRef(spec, doc.shots) : spec;
        const speed = clip.speed ?? 1;
        const info = mediaFor(media, clip.source);
        shot = {
          id, sceneIndex, shotIndex, kind: 'clip', file: clip.source,
          mediaPath: info?.path ?? `${rawDir(doc)}/${clip.source}`,
          in: clip.in, out: clip.out, speed, length: shotLength(clip.in, clip.out, speed), start: clock,
          screen: clip.screen ?? '', text: clip.text ?? '', ref: isRefShot(spec) ? spec.ref : undefined,
          textPos: clip.text_pos, textSize: clip.text_size, textFont: clip.text_font,
        };
      }
      clock += shot.length;
      sceneShots.push(shot);
      shots.push(shot);
    });
    scenes.push({ index: sceneIndex, name: scene.name, voiceover: scene.voiceover, start: sceneStart,
      length: clock - sceneStart, shots: sceneShots });
  });
  return {
    scenes, shots, total: clock,
    rateWpm: doc.voice?.rate_wpm ?? HANDOFF_RATE_WPM,
    leadIn: doc.voice?.lead_in ?? HANDOFF_LEAD_IN,
  };
}

export function demoTakeFile(item: DemoSceneItem): string {
  return `${item.stem}-t${item.take ?? 1}.mp4`;
}

export function buildDemoTimeline(doc: DemoDoc, media?: MediaIndex): Timeline {
  const scenes: TimelineScene[] = [];
  const shots: TimelineShot[] = [];
  let clock = 0;
  doc.sequence.forEach((item, sceneIndex) => {
    const id = `demo:${sceneIndex}`;
    let shot: TimelineShot;
    let name: string;
    if (isDemoCard(item)) {
      const length = item.duration ?? KEYNOTE_CARD_DEFAULT;
      name = `Card ${item.card}`;
      shot = {
        id, sceneIndex, shotIndex: 0, kind: 'card', card: item.card, cardTitle: item.title,
        cardSubtitle: item.subtitle, cardPng: media?.keynoteCards[item.card],
        in: 0, out: length, speed: 1, length, start: clock, screen: item.title, text: '',
      };
    } else {
      const file = demoTakeFile(item);
      const info = mediaFor(media, file);
      const [trimIn, trimOut] = item.trim ?? [null, null];
      const start = trimIn ?? 0;
      // build-keynote.py uses the take's full length when the out point is null.
      const end = trimOut ?? info?.duration ?? start + 1;
      const speed = item.speed ?? 1;
      name = `${item.scene} ${item.stem.replace(/^\d+[a-z]?-/, '')}`;
      shot = {
        id, sceneIndex, shotIndex: 0, kind: 'clip', file, mediaPath: info?.path ?? `${DEFAULT_RAW_DIR}/${file}`,
        in: start, out: end, speed, length: shotLength(start, end, speed), start: clock,
        screen: item.stem, text: item.caption ?? '', textPos: item.caption_pos, textFont: item.caption_font,
      };
    }
    clock += shot.length;
    shots.push(shot);
    scenes.push({ index: sceneIndex, name, voiceover: item.voiceover, start: shot.start, length: shot.length,
      shots: [shot] });
  });
  return { scenes, shots, total: clock, rateWpm: KEYNOTE_RATE_WPM, leadIn: KEYNOTE_LEAD_IN };
}

export function shotAt(timeline: Timeline, time: number): TimelineShot | undefined {
  const { shots } = timeline;
  if (!shots.length) return undefined;
  if (time <= 0) return shots[0];
  return shots.find((s) => time >= s.start && time < s.start + s.length) ?? shots[shots.length - 1];
}

// Source time inside a clip for a timeline time, and the reverse.
export function sourceTime(shot: TimelineShot, time: number): number {
  return shot.in + (time - shot.start) * shot.speed;
}
export function timelineTime(shot: TimelineShot, source: number): number {
  return shot.start + (source - shot.in) / shot.speed;
}

// m:ss.cc, close to the m:ss.s timecodes the scripts write.
export function timecode(seconds: number): string {
  const centis = Math.round(Math.max(0, seconds) * 100);
  const m = Math.floor(centis / 6000);
  const s = Math.floor((centis % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(centis % 100).padStart(2, '0')}`;
}

// Edges for snapping: every shot boundary plus the start and the end.
export function edges(timeline: Timeline): number[] {
  return [0, ...timeline.shots.map((s) => s.start + s.length)];
}

export function snap(value: number, targets: number[], tolerance: number): number {
  let best = value;
  let distance = tolerance;
  for (const t of targets) {
    const d = Math.abs(t - value);
    if (d <= distance) {
      best = t;
      distance = d;
    }
  }
  return best;
}
