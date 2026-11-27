import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate } from '../state/validators';
import { applyDemoEdit, applyHandoffEdit, EditError, refUses } from './edits';
import { REPO } from './python';
import { buildHandoffTimeline } from './timeline';
import type { ClipSpec, DemoDoc, DemoSceneItem, HandoffDoc, RefShotSpec } from './types';

const handoff = () => JSON.parse(readFileSync(join(REPO, 'examples/acme-invoice-bot/handoff.json'), 'utf8')) as HandoffDoc;
const demo = () => JSON.parse(readFileSync(join(REPO, 'examples/acme-invoice-bot/demo.json'), 'utf8')) as DemoDoc;

describe('handoff edits', () => {
  it('trims a clip without touching the input and keeps _ keys and key order', () => {
    const doc = handoff();
    const before = JSON.stringify(doc);
    const next = applyHandoffEdit(doc, 1, { op: 'shot', scene: 1, shot: 1, patch: { in: 2.25 } });
    expect(JSON.stringify(doc)).toBe(before);
    const clip = next.videos[1].scenes[1].shots[1] as ClipSpec;
    expect(clip.in).toBe(2.25);
    expect(Object.keys(next)).toEqual(Object.keys(doc));
    expect(next._comment).toBe(doc._comment);
    expect(validate('handoff', next)).toEqual([]);
  });

  it('overrides a ref shot for one video only', () => {
    const next = applyHandoffEdit(handoff(), 0, { op: 'shot', scene: 0, shot: 1, patch: { out: 7 }, mode: 'override' });
    expect(next.videos[0].scenes[0].shots[1]).toEqual({ ref: 'THREAD', out: 7 });
    expect(next.shots?.THREAD.out).toBe(9);
  });

  it('changes the shared shot everywhere and drops this shot\'s override of that field', () => {
    const doc = handoff();
    const next = applyHandoffEdit(doc, 1, { op: 'shot', scene: 3, shot: 1, patch: { speed: 2 }, mode: 'shared' });
    expect(next.shots?.THREAD.speed).toBe(2);
    expect(next.videos[1].scenes[3].shots[1]).toEqual({ ref: 'THREAD' });
    const promoThread = buildHandoffTimeline(next, 0).shots[1];
    expect(promoThread.length).toBeCloseTo(4, 9);
  });

  it('asks for a mode before editing a ref shot', () => {
    expect(() => applyHandoffEdit(handoff(), 0, { op: 'shot', scene: 0, shot: 1, patch: { in: 2 } })).toThrow(EditError);
  });

  it('refuses an out point before the in point', () => {
    expect(() => applyHandoffEdit(handoff(), 1, { op: 'shot', scene: 1, shot: 1, patch: { out: 0.5 } })).toThrow(EditError);
  });

  it('splits a clip at a source time into two shots', () => {
    const next = applyHandoffEdit(handoff(), 1, { op: 'split', scene: 1, shot: 1, at: 5 });
    const [a, b] = next.videos[1].scenes[1].shots.slice(1) as ClipSpec[];
    expect([a.in, a.out, b.in, b.out]).toEqual([0.8, 5, 5, 10]);
  });

  it('splits a ref shot into two overrides of the same ref', () => {
    const next = applyHandoffEdit(handoff(), 0, { op: 'split', scene: 0, shot: 1, at: 4 });
    expect(next.videos[0].scenes[0].shots.slice(1)).toEqual([{ ref: 'THREAD', out: 4 }, { ref: 'THREAD', in: 4 }]);
    expect(validate('handoff', next)).toEqual([]);
  });

  it('moves a shot to another scene and blocks emptying a scene', () => {
    const next = applyHandoffEdit(handoff(), 0, { op: 'move', from: { scene: 1, shot: 1 }, to: { scene: 0, index: 0 } });
    expect((next.videos[0].scenes[0].shots[0] as RefShotSpec).ref).toBe('DRAFT');
    expect(() => applyHandoffEdit(handoff(), 0, { op: 'move', from: { scene: 2, shot: 0 }, to: { scene: 0, index: 0 } })).toThrow(EditError);
  });

  it('reorders inside a scene', () => {
    const next = applyHandoffEdit(handoff(), 0, { op: 'move', from: { scene: 1, shot: 0 }, to: { scene: 1, index: 2 } });
    expect(next.videos[0].scenes[1].shots.map((s) => (s as RefShotSpec).ref)).toEqual(['DRAFT', 'ASK']);
  });

  it('inserts raw takes, cards and named shots from the bin', () => {
    let doc = applyHandoffEdit(handoff(), 0, { op: 'insert', scene: 0, index: 1, item: { kind: 'raw', file: '09-new-thing-t1.mp4', duration: 2.5 } });
    expect(doc.videos[0].scenes[0].shots[1]).toEqual({ source: '09-new-thing-t1.mp4', in: 0, out: 2.5, speed: 1, screen: 'new thing' });
    doc = applyHandoffEdit(doc, 0, { op: 'insert', scene: 0, index: 0, item: { kind: 'shot', name: 'APPROVE' } });
    doc = applyHandoffEdit(doc, 0, { op: 'insert', scene: 0, index: 0, item: { kind: 'card', name: 'card-use' } });
    expect(doc.videos[0].scenes[0].shots.slice(0, 2)).toEqual([{ card: 'card-use', length: 3 }, { ref: 'APPROVE' }]);
    expect(validate('handoff', doc)).toEqual([]);
  });

  it('removes a shot, and the scene with its last shot', () => {
    const doc = handoff();
    const next = applyHandoffEdit(doc, 0, { op: 'remove', scene: 2, shot: 0 });
    expect(next.videos[0].scenes.map((s) => s.name)).not.toContain('Approve');
  });

  it('edits scene, video, card and brand fields', () => {
    let doc = applyHandoffEdit(handoff(), 0, { op: 'scene', scene: 0, patch: { name: 'Opening', voiceover: 'Short line.' } });
    doc = applyHandoffEdit(doc, 0, { op: 'video', patch: { label: '' } });
    doc = applyHandoffEdit(doc, 0, { op: 'card', name: 'card-end', patch: { subtitle: 'New subtitle' } });
    doc = applyHandoffEdit(doc, 0, { op: 'brand', patch: { accent: '#112233' } });
    expect(doc.videos[0].scenes[0]).toMatchObject({ name: 'Opening', voiceover: 'Short line.' });
    expect('label' in doc.videos[0]).toBe(false);
    expect(doc.cards?.['card-end'].subtitle).toBe('New subtitle');
    expect(doc.brand?.accent).toBe('#112233');
    expect(validate('handoff', doc)).toEqual([]);
  });

  it('moves and sizes a clip\'s on-screen text, and clears it back to the default', () => {
    const moved = applyHandoffEdit(handoff(), 1, { op: 'shot', scene: 1, shot: 1, patch: { textPos: [0.251234, 0.8], textSize: 56 } });
    const clip = moved.videos[1].scenes[1].shots[1] as ClipSpec;
    expect(clip.text_pos).toEqual([0.251, 0.8]);
    expect(clip.text_size).toBe(56);
    expect(validate('handoff', moved)).toEqual([]);
    const reset = applyHandoffEdit(moved, 1, { op: 'shot', scene: 1, shot: 1, patch: { textPos: null, textSize: null } });
    const back = reset.videos[1].scenes[1].shots[1] as ClipSpec;
    expect('text_pos' in back || 'text_size' in back).toBe(false);
  });

  it('edits a card\'s on-screen text without losing its length', () => {
    const next = applyHandoffEdit(handoff(), 1, { op: 'shot', scene: 1, shot: 0, patch: { text: 'Setup', textPos: [0.3, 0.2] } });
    expect(next.videos[1].scenes[1].shots[0]).toEqual({ card: 'card-setup', length: 3, text: 'Setup', text_pos: [0.3, 0.2] });
    expect(validate('handoff', next)).toEqual([]);
  });

  it('moves a card\'s text without dropping its text or screen', () => {
    const doc = handoff();
    const card = doc.videos[0].scenes[0].shots[0];
    const moved = applyHandoffEdit(doc, 0, { op: 'shot', scene: 0, shot: 0, patch: { textPos: [0.4, 0.6] } });
    expect(moved.videos[0].scenes[0].shots[0]).toEqual({ ...card, text_pos: [0.4, 0.6] });
  });

  it('keeps a moved text inside the frame', () => {
    const moved = applyHandoffEdit(handoff(), 1, { op: 'shot', scene: 1, shot: 1, patch: { textPos: [1.4, -0.2] } });
    expect((moved.videos[1].scenes[1].shots[1] as ClipSpec).text_pos).toEqual([1, 0]);
  });

  it('shows the moved text on the timeline shot', () => {
    const moved = applyHandoffEdit(handoff(), 1, { op: 'shot', scene: 1, shot: 1, patch: { textPos: [0.3, 0.2], textSize: 60 } });
    const shot = buildHandoffTimeline(moved, 1).shots.find((s) => s.sceneIndex === 1 && s.shotIndex === 1);
    expect(shot?.textPos).toEqual([0.3, 0.2]);
    expect(shot?.textSize).toBe(60);
  });

  it('counts the uses of a named shot', () => {
    expect(refUses(handoff(), 'THREAD')).toBe(2);
  });
});

describe('demo.json edits', () => {
  it('trims into the trim pair and captions into caption', () => {
    const next = applyDemoEdit(demo(), { op: 'shot', scene: 1, shot: 0, patch: { in: 1.5, text: 'New caption' } });
    expect(next.sequence[1]).toMatchObject({ trim: [1.5, 9], caption: 'New caption' });
    expect(validate('demo', next)).toEqual([]);
  });

  it('changes a card\'s title or length without dropping the other', () => {
    const doc = demo();
    const index = doc.sequence.findIndex((item) => 'card' in item);
    const card = doc.sequence[index];
    const titled = applyDemoEdit(doc, { op: 'shot', scene: index, shot: 0, patch: { screen: 'New title' } }).sequence[index];
    expect(titled).toEqual({ ...card, title: 'New title' });
    const longer = applyDemoEdit(doc, { op: 'shot', scene: index, shot: 0, patch: { length: 4 } }).sequence[index];
    expect(longer).toEqual({ ...card, duration: 4 });
  });

  it('moves a caption pill without dropping its caption or speed', () => {
    const doc = demo();
    const item = doc.sequence[1];
    const moved = applyDemoEdit(doc, { op: 'shot', scene: 1, shot: 0, patch: { textPos: [0.5, 0.3] } }).sequence[1];
    expect(moved).toEqual({ ...item, caption_pos: [0.5, 0.3] });
  });

  it('moves a caption pill into caption_pos', () => {
    const next = applyDemoEdit(demo(), { op: 'shot', scene: 1, shot: 0, patch: { textPos: [0.5, 0.3] } });
    expect((next.sequence[1] as DemoSceneItem).caption_pos).toEqual([0.5, 0.3]);
    expect(validate('demo', next)).toEqual([]);
    const reset = applyDemoEdit(next, { op: 'shot', scene: 1, shot: 0, patch: { textPos: null } });
    expect('caption_pos' in reset.sequence[1]).toBe(false);
  });

  it('splits a scene item, giving the second half a new scene id', () => {
    const next = applyDemoEdit(demo(), { op: 'split', scene: 1, shot: 0, at: 5 });
    const [a, b] = next.sequence.slice(1, 3) as DemoSceneItem[];
    expect(a.trim).toEqual([1, 5]);
    expect(b).toMatchObject({ scene: '01b', trim: [5, 9] });
    expect(validate('demo', next)).toEqual([]);
  });

  it('adds a take from the bin as a scene item', () => {
    const next = applyDemoEdit(demo(), { op: 'insert', scene: 0, index: 1, item: { kind: 'raw', file: '07-missing-amount-t1.mp4', duration: 12 } });
    expect(next.sequence[1]).toEqual({ scene: '07', stem: '07-missing-amount', take: 1 });
    expect(() => applyDemoEdit(demo(), { op: 'insert', scene: 0, index: 1, item: { kind: 'raw', file: 'Screen Recording.mov', duration: 3 } })).toThrow(EditError);
  });

  it('reorders items', () => {
    const next = applyDemoEdit(demo(), { op: 'move', from: { scene: 0, shot: 0 }, to: { scene: 1, index: 1 } });
    expect(next.sequence.slice(0, 2).map((i) => ('card' in i ? i.card : i.scene))).toEqual(['01', 'intro']);
  });
});
