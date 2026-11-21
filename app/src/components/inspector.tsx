import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { refUses, type Edit, type ShotPatch } from '../lib/edits';
import { spokenSeconds, wordCount, type VoiceoverFit } from '../lib/fit';
import { isDemoCard } from '../lib/timeline';
import type { DemoDoc, FileKind, HandoffDoc, Selection, Timeline } from '../lib/types';
import { ColorField, NumberField, TextArea, TextField } from './fields';

type Tab = 'selection' | 'video' | 'brand';

interface Props {
  kind: FileKind;
  doc: HandoffDoc | DemoDoc;
  videoIndex: number;
  timeline: Timeline;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onEdit: (edit: Edit) => void;
  onShotPatch: (scene: number, shot: number, patch: ShotPatch) => void;
  durations: Record<string, number | null>;
  fits: VoiceoverFit[];
  errors: string[];
}

function ShotPanel({ kind, doc, timeline, selection, onEdit, onShotPatch, durations }: Props & { selection: { type: 'shot'; scene: number; shot: number } }) {
  const shot = timeline.scenes[selection.scene]?.shots[selection.shot];
  if (!shot) return <p className="muted">That shot is gone. Pick another on the timeline.</p>;
  const patch = (p: ShotPatch) => onShotPatch(selection.scene, selection.shot, p);
  const max = shot.file ? durations[shot.file] ?? undefined : undefined;
  if (shot.kind === 'card') {
    return (
      <>
        <h4>Title card</h4>
        <dl className="kv"><dt>Card</dt><dd>{shot.card}</dd><dt>Starts</dt><dd className="mono">{shot.start.toFixed(2)}s</dd></dl>
        <NumberField label="Length (seconds)" value={round(shot.length)} min={0.1} step={0.1} onCommit={(v) => patch({ length: v })} testId="card-length" />
        {kind === 'handoff' && (
          <>
            <TextField label="Screen (for the script)" value={shot.screen === 'Title card placeholder' ? '' : shot.screen} placeholder="Title card placeholder" onCommit={(v) => patch({ screen: v })} />
            <TextField label="On-screen text" value={shot.text} onCommit={(v) => patch({ text: v })} />
          </>
        )}
        <CardFields kind={kind} doc={doc} name={shot.card ?? ''} onEdit={onEdit} />
        <ShotActions selection={selection} onEdit={onEdit} />
      </>
    );
  }
  const uses = shot.ref && kind === 'handoff' ? refUses(doc as HandoffDoc, shot.ref) : 0;
  return (
    <>
      <h4>Shot</h4>
      {shot.ref && (
        <div className="note" data-testid="ref-note">
          Uses the shared shot <b>{shot.ref}</b> ({uses} use{uses === 1 ? '' : 's'} across the videos). Changes ask whether to update the shared shot or this video only.
        </div>
      )}
      <dl className="kv">
        <dt>Source</dt><dd title={shot.file}>{shot.file}</dd>
        <dt>Take</dt><dd className="mono">{max != null ? `${max.toFixed(2)}s long` : 'length unknown'}</dd>
        <dt>On timeline</dt><dd className="mono">{shot.start.toFixed(2)}s, {shot.length.toFixed(2)}s long</dd>
      </dl>
      <div className="row">
        <NumberField label="In (seconds)" value={round(shot.in)} min={0} max={shot.out - 0.1} step={0.1} onCommit={(v) => patch({ in: v })} testId="shot-in" />
        <NumberField label="Out (seconds)" value={round(shot.out)} min={shot.in + 0.1} max={max} step={0.1} onCommit={(v) => patch({ out: v })} testId="shot-out" />
      </div>
      <SpeedField value={shot.speed} onCommit={(v) => patch({ speed: v })} />
      {kind === 'handoff'
        ? <TextArea label="Screen (what is on screen, for the script)" value={shot.screen} onCommit={(v) => patch({ screen: v })} />
        : <dl className="kv"><dt>Stem</dt><dd>{shot.screen}</dd></dl>}
      <TextField label={kind === 'handoff' ? 'On-screen text' : 'Caption'} value={shot.text} onCommit={(v) => patch({ text: v })} testId="shot-text" />
      <ShotActions selection={selection} onEdit={onEdit} />
    </>
  );
}

function SpeedField({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="field">
      <span>Speed ({draft}x)</span>
      <div className="speed-row">
        <input type="range" min={0.25} max={4} step={0.05} value={draft} aria-label="Speed slider"
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={() => draft !== value && onCommit(draft)} onKeyUp={() => draft !== value && onCommit(draft)} />
        <input type="number" min={0.1} step={0.05} value={draft} aria-label="Speed"
          onChange={(e) => setDraft(Number(e.target.value))}
          onBlur={() => draft > 0 && draft !== value && onCommit(draft)}
          onKeyDown={(e) => { if (e.key === 'Enter' && draft > 0 && draft !== value) onCommit(draft); }} />
      </div>
    </label>
  );
}

function ShotActions({ selection, onEdit }: { selection: { scene: number; shot: number }; onEdit: (e: Edit) => void }) {
  return (
    <div className="actions">
      <button className="btn danger" onClick={() => onEdit({ op: 'remove', scene: selection.scene, shot: selection.shot })}><Trash2 size={14} />Remove shot</button>
    </div>
  );
}

function ScenePanel({ kind, timeline, selection, onEdit, fits }: Props & { selection: { type: 'scene'; scene: number } }) {
  const scene = timeline.scenes[selection.scene];
  const [draft, setDraft] = useState(scene?.voiceover ?? '');
  useEffect(() => setDraft(scene?.voiceover ?? ''), [scene?.voiceover, selection.scene]);
  if (!scene) return <p className="muted">That scene is gone.</p>;
  const fit = fits.find((f) => f.sceneIndex === scene.index);
  const seconds = spokenSeconds(draft, timeline.rateWpm);
  const available = fit?.available ?? Math.max(0, timeline.total - scene.start - timeline.leadIn);
  const over = draft.trim() !== '' && seconds > available + 1e-9;
  return (
    <>
      <h4>Scene {scene.index + 1}</h4>
      {kind === 'handoff'
        ? <TextField label="Name" value={scene.name} onCommit={(v) => onEdit({ op: 'scene', scene: scene.index, patch: { name: v } })} testId="scene-name" />
        : <dl className="kv"><dt>Item</dt><dd>{scene.name}</dd></dl>}
      <TextArea label="Voiceover" value={scene.voiceover ?? ''} onDraft={setDraft} testId="scene-voiceover"
        onCommit={(v) => onEdit({ op: 'scene', scene: scene.index, patch: { voiceover: v } })} />
      <div className={`fit-readout${over ? ' over' : ''}`} data-testid="fit-readout">
        {wordCount(draft)} words, about {seconds.toFixed(1)}s at {timeline.rateWpm} words per minute. {available.toFixed(1)}s available{over ? '. Too long: cut words, slow a shot, or lengthen a card.' : '.'}
      </div>
      <dl className="kv"><dt>Starts</dt><dd className="mono">{scene.start.toFixed(2)}s</dd><dt>Length</dt><dd className="mono">{scene.length.toFixed(2)}s</dd><dt>Shots</dt><dd>{scene.shots.length}</dd></dl>
      <div className="actions">
        <button className="btn" onClick={() => onEdit({ op: 'addScene', after: scene.index })}><Plus size={14} />{kind === 'handoff' ? 'Add scene after' : 'Duplicate item'}</button>
        <button className="btn danger" onClick={() => onEdit({ op: 'removeScene', scene: scene.index })}><Trash2 size={14} />{kind === 'handoff' ? 'Delete scene' : 'Delete item'}</button>
      </div>
    </>
  );
}

function CardFields({ kind, doc, name, onEdit }: { kind: FileKind; doc: HandoffDoc | DemoDoc; name: string; onEdit: (e: Edit) => void }) {
  const card = kind === 'handoff'
    ? (doc as HandoffDoc).cards?.[name]
    : (doc as DemoDoc).sequence.find((i) => isDemoCard(i) && i.card === name) as { title: string; subtitle?: string; logo?: boolean } | undefined;
  if (!card) return <div className="note bad">No wording for {name}. Add it under cards in handoff.json.</div>;
  const edit = (patch: Record<string, unknown>) => onEdit({ op: 'card', name, patch });
  const people = kind === 'handoff' ? (card as { people?: { name: string; role?: string }[] }).people ?? [] : [];
  return (
    <>
      <TextField label="Card title" value={card.title} onCommit={(v) => edit({ title: v })} testId="card-title" />
      <TextField label="Card subtitle" value={card.subtitle ?? ''} onCommit={(v) => edit({ subtitle: v })} />
      <label className="field check-field">
        <input type="checkbox" checked={Boolean(card.logo)} onChange={(e) => edit({ logo: e.target.checked || undefined })} />
        <span>Show the brand logo</span>
      </label>
      {kind === 'handoff' && (
        <TextArea label="People (one per line: Name, role)" value={people.map((p) => (p.role ? `${p.name}, ${p.role}` : p.name)).join('\n')}
          onCommit={(v) => {
            const list = v.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
              const [person, ...role] = l.split(',');
              const keep = people.find((p) => p.name === person.trim());
              return { ...keep, name: person.trim(), ...(role.join(',').trim() ? { role: role.join(',').trim() } : {}) };
            });
            edit({ people: list.length ? list : undefined });
          }} />
      )}
      <p className="field-note">Render Title cards to update the PNG; until then the preview draws the card from this text.</p>
    </>
  );
}

function VideoPanel({ kind, doc, videoIndex, onEdit, timeline }: Props) {
  if (kind === 'demo') {
    const d = doc as DemoDoc;
    return (
      <>
        <h4>Keynote cut</h4>
        <TextField label="Title (names the output file)" value={d.title} onCommit={(v) => onEdit({ op: 'video', patch: { title: v } })} />
        <dl className="kv"><dt>Items</dt><dd>{d.sequence.length}</dd><dt>Length</dt><dd className="mono">{timeline.total.toFixed(1)}s</dd></dl>
      </>
    );
  }
  const video = (doc as HandoffDoc).videos[videoIndex];
  if (!video) return null;
  return (
    <>
      <h4>Video {video.key}</h4>
      <TextField label="Title" value={video.title ?? ''} placeholder={`${(doc as HandoffDoc).title.toUpperCase()}: ${video.key}`} onCommit={(v) => onEdit({ op: 'video', patch: { title: v } })} testId="video-title" />
      <TextField label="Label (for the brief)" value={video.label ?? ''} onCommit={(v) => onEdit({ op: 'video', patch: { label: v } })} />
      <dl className="kv"><dt>Scenes</dt><dd>{video.scenes.length}</dd><dt>Length</dt><dd className="mono">{timeline.total.toFixed(1)}s</dd></dl>
    </>
  );
}

function BrandPanel({ kind, doc, onEdit }: Props) {
  if (kind === 'demo') return <p className="muted">Brand settings live in handoff.json. The keynote look is set in mk-assets.py and build-keynote.py.</p>;
  const brand = (doc as HandoffDoc).brand ?? {};
  const edit = (patch: Record<string, unknown>) => onEdit({ op: 'brand', patch });
  return (
    <>
      <h4>Brand</h4>
      <TextField label="Name" value={brand.name ?? ''} onCommit={(v) => edit({ name: v })} />
      <ColorField label="Background" value={brand.background ?? ''} onCommit={(v) => edit({ background: v })} />
      <ColorField label="Title colour" value={brand.title_color ?? ''} onCommit={(v) => edit({ title_color: v })} />
      <ColorField label="Subtitle colour" value={brand.subtitle_color ?? ''} onCommit={(v) => edit({ subtitle_color: v })} />
      <ColorField label="Accent" value={brand.accent ?? ''} onCommit={(v) => edit({ accent: v })} />
      <TextField label="Font (CSS font-family, single quotes inside)" value={brand.font ?? ''} onCommit={(v) => edit({ font: v })} />
      <TextField label="Logo (path from handoff.json)" value={brand.logo ?? ''} onCommit={(v) => edit({ logo: v })} />
    </>
  );
}

export function Inspector(props: Props) {
  const { selection, errors, kind } = props;
  const [tab, setTab] = useState<Tab>('selection');
  useEffect(() => {
    if (selection?.type === 'brand') setTab('brand');
    else if (selection?.type === 'video') setTab('video');
    else if (selection) setTab('selection');
  }, [selection]);
  return (
    <aside className="panel inspector" aria-label="Inspector">
      <div className="inspector-tabs" role="tablist">
        {(['selection', 'video', 'brand'] as Tab[]).map((t) => (
          <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'selection' ? 'Selection' : t === 'video' ? (kind === 'demo' ? 'Cut' : 'Video') : 'Brand'}
          </button>
        ))}
      </div>
      <div className="inspector-body" data-testid="inspector">
        {errors.length > 0 && (
          <ul className="errors" data-testid="validation-errors">
            {errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
            {errors.length > 8 && <li>and {errors.length - 8} more</li>}
          </ul>
        )}
        {tab === 'selection' && (
          selection?.type === 'shot' ? <ShotPanel {...props} selection={selection} />
            : selection?.type === 'scene' ? <ScenePanel {...props} selection={selection} />
              : selection?.type === 'card' ? (<><h4>Title card {selection.name}</h4><CardFields kind={kind} doc={props.doc} name={selection.name} onEdit={props.onEdit} /></>)
                : <p className="muted">Select a shot or a scene on the timeline, or a card in the media bin.</p>
        )}
        {tab === 'video' && <VideoPanel {...props} />}
        {tab === 'brand' && <BrandPanel {...props} />}
      </div>
    </aside>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;
