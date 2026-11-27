// Document edits. Each one returns a new document and leaves the input untouched; key order and
// unknown fields (including `_` keys) survive because edits work on a structured clone.
import { TEXT_SIZE } from '../../shared/text-style.mjs';
import { demoCardTiming, isCardShot, isDemoCard, isRefShot, KEYNOTE_CARD_DEFAULT } from './timeline';
import type {
  Brand, CardText, ClipSpec, DemoDoc, DemoItem, DemoSceneItem, FileKind, HandoffDoc, RefShotSpec,
  SceneSpec, ShotSpec, VideoSpec,
} from './types';

export class EditError extends Error {}

export type RefMode = 'shared' | 'override';
export interface ShotPatch {
  in?: number;
  out?: number;
  speed?: number;
  screen?: string;
  text?: string;
  length?: number;
  textPos?: [number, number] | null; // null puts the text back in its default spot
  textSize?: number | null;
  textFont?: string | null; // a font id; null goes back to the default
}
export type BinItem =
  | { kind: 'raw'; file: string; duration: number | null }
  | { kind: 'card'; name: string }
  | { kind: 'shot'; name: string };

export type Edit =
  | { op: 'shot'; scene: number; shot: number; patch: ShotPatch; mode?: RefMode }
  | { op: 'move'; from: { scene: number; shot: number }; to: { scene: number; index: number } }
  | { op: 'insert'; scene: number; index: number; item: BinItem }
  | { op: 'remove'; scene: number; shot: number }
  | { op: 'split'; scene: number; shot: number; at: number }
  | { op: 'scene'; scene: number; patch: { name?: string; voiceover?: string } }
  | { op: 'addScene'; after: number }
  | { op: 'removeScene'; scene: number }
  | { op: 'video'; patch: { title?: string; label?: string } }
  | { op: 'card'; name: string; patch: Partial<CardText> }
  | { op: 'brand'; patch: Partial<Brand> };

const MIN_LENGTH = 0.1;
export const round = (n: number) => Math.round(n * 100) / 100;

function clone<T>(value: T): T {
  return structuredClone(value);
}

// Sets or clears optional fields: an empty string or undefined removes the key.
function assign(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '') delete target[key];
    else target[key] = typeof value === 'number' ? round(value) : value;
  }
}

// The fields a patch actually sets. assign() reads undefined as "remove the key", so a patch that
// only moves the text must not pass the fields it leaves alone.
function defined(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

function checkRange(start: number, end: number) {
  if (!(end - start >= MIN_LENGTH - 1e-9)) throw new EditError('The out point must be after the in point.');
  if (start < 0) throw new EditError('The in point cannot be before the start of the take.');
}

function humanize(file: string) {
  return file.replace(/\.(mp4|mov)$/, '').replace(/-t\d+$/, '').replace(/^\d+[a-z]?-/, '').replace(/-/g, ' ');
}

// ---------------------------------------------------------------- handoff.json

function videoOf(doc: HandoffDoc, videoIndex: number): VideoSpec {
  const video = doc.videos[videoIndex];
  if (!video) throw new EditError('That video no longer exists.');
  return video;
}

function sceneOf(video: VideoSpec, index: number): SceneSpec {
  const scene = video.scenes[index];
  if (!scene) throw new EditError('That scene no longer exists.');
  return scene;
}

function shotOf(scene: SceneSpec, index: number): ShotSpec {
  const shot = scene.shots[index];
  if (!shot) throw new EditError('That shot no longer exists.');
  return shot;
}

export { TEXT_SIZE };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const point = (p: [number, number]): [number, number] =>
  [Math.round(clamp(p[0], 0, 1) * 1000) / 1000, Math.round(clamp(p[1], 0, 1) * 1000) / 1000];

// Where the on-screen text goes: a frame point (clamped, 3 decimals) or '' to clear the key.
function textFields(patch: ShotPatch, posKey: string, sizeKey: string | undefined, fontKey: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.textFont !== undefined) out[fontKey] = patch.textFont ?? '';
  if (patch.textPos !== undefined) out[posKey] = patch.textPos === null ? '' : point(patch.textPos);
  if (sizeKey && patch.textSize !== undefined) {
    out[sizeKey] = patch.textSize === null ? '' : Math.round(clamp(patch.textSize, TEXT_SIZE.min, TEXT_SIZE.max));
  }
  return out;
}

function patchClipFields(patch: ShotPatch): Record<string, unknown> {
  const { length: _length, textPos: _pos, textSize: _size, textFont: _font, ...rest } = patch;
  return { ...rest, ...textFields(patch, 'text_pos', 'text_size', 'text_font') };
}

function updateRefShot(doc: HandoffDoc, spec: RefShotSpec, patch: ShotPatch, mode: RefMode) {
  const base = doc.shots?.[spec.ref];
  if (!base) throw new EditError(`Shot '${spec.ref}' is not in the shared shots list.`);
  const fields = patchClipFields(patch);
  if (mode === 'shared') {
    assign(base as unknown as Record<string, unknown>, fields);
    for (const key of Object.keys(fields)) delete (spec as unknown as Record<string, unknown>)[key];
    checkRange(base.in, base.out);
    return;
  }
  assign(spec as unknown as Record<string, unknown>, fields);
  // An override equal to the shared value is noise; drop it.
  for (const key of Object.keys(fields) as (keyof ClipSpec)[]) {
    const own = (spec as unknown as Record<string, unknown>)[key];
    if (own !== undefined && JSON.stringify(own) === JSON.stringify(base[key])) delete (spec as unknown as Record<string, unknown>)[key];
  }
  checkRange(spec.in ?? base.in, spec.out ?? base.out);
}

function updateHandoffShot(doc: HandoffDoc, spec: ShotSpec, patch: ShotPatch, mode: RefMode | undefined) {
  if (isCardShot(spec)) {
    const { length, screen, text } = patch;
    const next = length ?? (patch.out !== undefined ? patch.out - (patch.in ?? 0) : undefined);
    if (next !== undefined && next < MIN_LENGTH) throw new EditError('A card needs some length.');
    assign(spec as unknown as Record<string, unknown>, defined({ length: next, screen, text, ...textFields(patch, 'text_pos', 'text_size', 'text_font') }));
    if (screen === '') delete (spec as Partial<typeof spec>).screen;
    return;
  }
  if (isRefShot(spec)) {
    if (!mode) throw new EditError('Choose whether to change the shared shot or this video only.');
    updateRefShot(doc, spec, patch, mode);
    return;
  }
  const fields = patchClipFields(patch);
  // screen is required on a clip, so keep it even when empty.
  const { screen, ...rest } = fields;
  assign(spec as unknown as Record<string, unknown>, rest);
  if (screen !== undefined) spec.screen = String(screen);
  checkRange(spec.in, spec.out);
}

function shotFromBin(doc: HandoffDoc, item: BinItem): ShotSpec {
  if (item.kind === 'card') {
    if (!doc.cards?.[item.name]) throw new EditError(`Card '${item.name}' has no wording in cards.`);
    return { card: item.name, length: 3 };
  }
  if (item.kind === 'shot') {
    if (!doc.shots?.[item.name]) throw new EditError(`Shot '${item.name}' is not in the shared shots list.`);
    return { ref: item.name };
  }
  const out = round(Math.min(item.duration ?? 4, 4));
  return { source: item.file, in: 0, out: Math.max(out, MIN_LENGTH), speed: 1, screen: humanize(item.file) };
}

function splitHandoffShot(spec: ShotSpec, doc: HandoffDoc, at: number): [ShotSpec, ShotSpec] {
  if (isCardShot(spec)) {
    const first = round(at);
    if (first < MIN_LENGTH || spec.length - first < MIN_LENGTH) throw new EditError('Move the playhead inside the card to split it.');
    return [{ ...spec, length: first }, { ...spec, length: round(spec.length - first) }];
  }
  const clip = isRefShot(spec) ? { ...doc.shots?.[spec.ref], ...spec } as ClipSpec : spec;
  const t = round(at);
  if (t - clip.in < MIN_LENGTH || clip.out - t < MIN_LENGTH) throw new EditError('Move the playhead inside the shot to split it.');
  return [{ ...spec, out: t }, { ...spec, in: t }];
}

export function applyHandoffEdit(input: HandoffDoc, videoIndex: number, edit: Edit): HandoffDoc {
  const doc = clone(input);
  switch (edit.op) {
    case 'shot': {
      const spec = shotOf(sceneOf(videoOf(doc, videoIndex), edit.scene), edit.shot);
      updateHandoffShot(doc, spec, edit.patch, edit.mode);
      return doc;
    }
    case 'move': {
      const video = videoOf(doc, videoIndex);
      const from = sceneOf(video, edit.from.scene);
      const target = sceneOf(video, edit.to.scene);
      if (from === target && from.shots.length === 1) return input;
      if (from !== target && from.shots.length === 1) {
        throw new EditError('A scene needs at least one shot. Delete the scene instead, or add a shot first.');
      }
      const [moved] = from.shots.splice(edit.from.shot, 1);
      let index = edit.to.index;
      if (from === target && edit.from.shot < index) index -= 1;
      target.shots.splice(Math.max(0, Math.min(index, target.shots.length)), 0, moved);
      return doc;
    }
    case 'insert': {
      const scene = sceneOf(videoOf(doc, videoIndex), edit.scene);
      scene.shots.splice(Math.max(0, Math.min(edit.index, scene.shots.length)), 0, shotFromBin(doc, edit.item));
      return doc;
    }
    case 'remove': {
      const video = videoOf(doc, videoIndex);
      const scene = sceneOf(video, edit.scene);
      shotOf(scene, edit.shot);
      if (scene.shots.length > 1) {
        scene.shots.splice(edit.shot, 1);
        return doc;
      }
      if (video.scenes.length === 1) throw new EditError('A video needs at least one shot.');
      video.scenes.splice(edit.scene, 1);
      return doc;
    }
    case 'split': {
      const scene = sceneOf(videoOf(doc, videoIndex), edit.scene);
      const parts = splitHandoffShot(shotOf(scene, edit.shot), doc, edit.at);
      scene.shots.splice(edit.shot, 1, ...parts);
      return doc;
    }
    case 'scene': {
      const scene = sceneOf(videoOf(doc, videoIndex), edit.scene);
      if (edit.patch.name !== undefined && !edit.patch.name.trim()) throw new EditError('A scene needs a name.');
      if (edit.patch.name !== undefined) scene.name = edit.patch.name;
      if (edit.patch.voiceover !== undefined) assign(scene as unknown as Record<string, unknown>, { voiceover: edit.patch.voiceover });
      return doc;
    }
    case 'addScene': {
      const video = videoOf(doc, videoIndex);
      const source = sceneOf(video, edit.after);
      const shot = clone(source.shots[source.shots.length - 1]);
      video.scenes.splice(edit.after + 1, 0, { name: 'New scene', shots: [shot] });
      return doc;
    }
    case 'removeScene': {
      const video = videoOf(doc, videoIndex);
      sceneOf(video, edit.scene);
      if (video.scenes.length === 1) throw new EditError('A video needs at least one scene.');
      video.scenes.splice(edit.scene, 1);
      return doc;
    }
    case 'video': {
      assign(videoOf(doc, videoIndex) as unknown as Record<string, unknown>, edit.patch);
      return doc;
    }
    case 'card': {
      const card = doc.cards?.[edit.name];
      if (!card) throw new EditError(`Card '${edit.name}' is not in cards.`);
      if (edit.patch.title !== undefined && !edit.patch.title) throw new EditError('A card needs a title.');
      assign(card as unknown as Record<string, unknown>, edit.patch as Record<string, unknown>);
      return doc;
    }
    case 'brand': {
      doc.brand = doc.brand ?? {};
      assign(doc.brand as Record<string, unknown>, edit.patch as Record<string, unknown>);
      return doc;
    }
  }
}

// ---------------------------------------------------------------- demo.json

const TAKE_NAME = /^(\d{2}[a-z]?)(-[a-z0-9-]+?)-t(\d+)\.mp4$/;

function itemOf(doc: DemoDoc, index: number): DemoItem {
  const item = doc.sequence[index];
  if (!item) throw new EditError('That item no longer exists.');
  return item;
}

function nextSceneId(doc: DemoDoc, id: string): string {
  const base = id.slice(0, 2);
  const used = new Set(doc.sequence.filter((i): i is DemoSceneItem => !isDemoCard(i)).map((i) => i.scene));
  for (const letter of 'bcdefghijklmnopqrstuvwxyz') {
    if (!used.has(base + letter)) return base + letter;
  }
  return id;
}

// A card name no other card in the sequence has: base, then base-2, base-3 ...
function freeCardName(doc: DemoDoc, base: string): string {
  const used = new Set(doc.sequence.filter(isDemoCard).map((c) => c.card));
  let name = base;
  for (let n = 2; used.has(name); n += 1) name = `${base}-${n}`;
  return name;
}

// outro: the end card's outro seconds, which the timeline length includes and duration does not.
function updateDemoItem(item: DemoItem, patch: ShotPatch, outro = 0) {
  if (isDemoCard(item)) {
    const shown = patch.length ?? (patch.out !== undefined ? patch.out - (patch.in ?? 0) : undefined);
    const length = shown === undefined ? undefined : shown - outro;
    if (length !== undefined && length < MIN_LENGTH) throw new EditError('A card needs some length.');
    assign(item as unknown as Record<string, unknown>, defined({ duration: length, title: patch.screen }));
    if (!item.title) throw new EditError('A card needs a title.');
    return;
  }
  const [oldIn, oldOut] = item.trim ?? [null, null];
  if (patch.in !== undefined || patch.out !== undefined) {
    const start = patch.in !== undefined ? round(patch.in) : oldIn;
    const end = patch.out !== undefined ? round(patch.out) : oldOut;
    if (end !== null) checkRange(start ?? 0, end);
    item.trim = [start, end];
  }
  if (item.callouts?.length) {
    assign(item as unknown as Record<string, unknown>, defined({ speed: patch.speed }));
    updateFirstCallout(item, patch);
    return;
  }
  assign(item as unknown as Record<string, unknown>, defined({ speed: patch.speed, caption: patch.text, ...textFields(patch, 'caption_pos', undefined, 'caption_font') }));
}

// The render draws callouts instead of caption, so the pill text lives on the first callout. A
// callout needs text: clearing it removes the callout, and the key with the last one (an empty
// array means no pill to the render).
function updateFirstCallout(item: DemoSceneItem, patch: ShotPatch) {
  const callouts = item.callouts ?? [];
  if (patch.text === '') {
    callouts.shift();
    if (!callouts.length) delete item.callouts;
    return;
  }
  assign(callouts[0] as unknown as Record<string, unknown>, defined({ text: patch.text, ...textFields(patch, 'pos', undefined, 'font') }));
}

function demoItemFromBin(doc: DemoDoc, item: BinItem): DemoItem {
  if (item.kind === 'raw') {
    const match = TAKE_NAME.exec(item.file);
    if (!match) throw new EditError('demo.json scenes need takes named <scene>-<name>-t<take>.mp4.');
    return { scene: match[1], stem: match[1] + match[2], take: Number(match[3]) };
  }
  return { card: freeCardName(doc, 'card'), title: 'New card', duration: KEYNOTE_CARD_DEFAULT };
}

export function applyDemoEdit(input: DemoDoc, edit: Edit, durations: Record<string, number | null> = {}): DemoDoc {
  const doc = clone(input);
  const seq = doc.sequence;
  switch (edit.op) {
    case 'shot': {
      const item = itemOf(doc, edit.scene);
      updateDemoItem(item, edit.patch, isDemoCard(item) ? demoCardTiming(doc, edit.scene).outro : 0);
      return doc;
    }
    case 'move': {
      itemOf(doc, edit.from.scene);
      // In demo.json every item is its own scene, so a drop position maps to an item position.
      let index = edit.to.scene + (edit.to.index > 0 ? 1 : 0);
      const [moved] = seq.splice(edit.from.scene, 1);
      if (edit.from.scene < index) index -= 1;
      seq.splice(Math.max(0, Math.min(index, seq.length)), 0, moved);
      return doc;
    }
    case 'insert': {
      const index = edit.scene + (edit.index > 0 ? 1 : 0);
      seq.splice(Math.max(0, Math.min(index, seq.length)), 0, demoItemFromBin(doc, edit.item));
      return doc;
    }
    case 'remove':
    case 'removeScene': {
      itemOf(doc, edit.scene);
      if (seq.length === 1) throw new EditError('The sequence needs at least one item.');
      seq.splice(edit.scene, 1);
      return doc;
    }
    case 'split': {
      const item = itemOf(doc, edit.scene);
      const t = round(edit.at);
      if (isDemoCard(item)) {
        const length = demoCardTiming(doc, edit.scene).seconds;
        if (t < MIN_LENGTH || length - t < MIN_LENGTH) throw new EditError('Move the playhead inside the card to split it.');
        seq.splice(edit.scene, 1, { ...item, duration: t }, { ...item, card: freeCardName(doc, item.card), duration: round(length - t) });
        return doc;
      }
      const [start, end] = item.trim ?? [null, null];
      const stop = end ?? durations[`${item.stem}-t${item.take ?? 1}.mp4`] ?? null;
      if (t - (start ?? 0) < MIN_LENGTH || (stop !== null && stop - t < MIN_LENGTH)) {
        throw new EditError('Move the playhead inside the shot to split it.');
      }
      const { voiceover: _vo, ...rest } = item;
      seq.splice(edit.scene, 1, { ...item, trim: [start, t] }, { ...rest, scene: nextSceneId(doc, item.scene), trim: [t, end] });
      return doc;
    }
    case 'scene': {
      const item = itemOf(doc, edit.scene);
      if (edit.patch.voiceover !== undefined) assign(item as unknown as Record<string, unknown>, { voiceover: edit.patch.voiceover });
      return doc;
    }
    case 'addScene': {
      const item = clone(itemOf(doc, edit.after));
      // Cards and scenes are keyed by name and id in the render, so the copy needs its own.
      if (isDemoCard(item)) item.card = freeCardName(doc, item.card);
      else item.scene = nextSceneId(doc, item.scene);
      seq.splice(edit.after + 1, 0, item);
      return doc;
    }
    case 'video': {
      if (edit.patch.title !== undefined) {
        if (!edit.patch.title) throw new EditError('demo.json needs a title.');
        doc.title = edit.patch.title;
      }
      return doc;
    }
    case 'card': {
      const item = seq.find((i) => isDemoCard(i) && i.card === edit.name);
      if (!item) throw new EditError(`Card '${edit.name}' is not in the sequence.`);
      if (edit.patch.title !== undefined && !edit.patch.title) throw new EditError('A card needs a title.');
      const { people: _people, ...patch } = edit.patch;
      assign(item as unknown as Record<string, unknown>, patch as Record<string, unknown>);
      return doc;
    }
    case 'brand':
      throw new EditError('demo.json has no brand settings; brand lives in handoff.json.');
  }
}

export function applyEdit(
  kind: FileKind, doc: HandoffDoc | DemoDoc, videoIndex: number, edit: Edit,
  durations?: Record<string, number | null>,
): HandoffDoc | DemoDoc {
  return kind === 'handoff'
    ? applyHandoffEdit(doc as HandoffDoc, videoIndex, edit)
    : applyDemoEdit(doc as DemoDoc, edit, durations);
}

// How many places use a named shot, across every video.
export function refUses(doc: HandoffDoc, name: string): number {
  return doc.videos.reduce((n, v) => n + v.scenes.reduce((m, s) => m + s.shots.filter((x) => isRefShot(x) && x.ref === name).length, 0), 0);
}
