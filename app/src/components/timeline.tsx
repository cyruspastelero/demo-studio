import { Magnet, Scissors, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { thumbUrl } from '../api';
import type { BinItem, Edit, ShotPatch } from '../lib/edits';
import type { VoiceoverFit } from '../lib/fit';
import type { Player } from '../lib/player';
import { edges, snap } from '../lib/timeline';
import type { Selection, Timeline as TimelineModel, TimelineShot } from '../lib/types';
import { DRAG_TYPE } from './media-bin';

export const MIN_PPS = 8;
export const MAX_PPS = 240;
const SNAP_PX = 8;
const MIN_SHOT = 0.1;
const MOVE_TYPE = 'application/x-demo-studio-move';

interface Trim {
  id: string;
  side: 'left' | 'right';
  x0: number;
  shot: TimelineShot;
  length: number;
}

function tickStep(pps: number) {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60];
  return steps.find((s) => s * pps >= 64) ?? 120;
}

function useTime(player: Player | null) {
  return useSyncExternalStore(
    player?.subscribe ?? (() => () => undefined),
    () => player?.getSnapshot().time ?? 0,
  );
}

export function Timeline({
  timeline, pps, onZoom, player, selection, onSelect, onEdit, onShotPatch, fits, durations, snapping, onSnapping,
}: {
  timeline: TimelineModel;
  pps: number;
  onZoom: (pps: number) => void;
  player: Player | null;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onEdit: (edit: Edit) => void;
  onShotPatch: (scene: number, shot: number, patch: ShotPatch) => void;
  fits: VoiceoverFit[];
  durations: Record<string, number | null>;
  snapping: boolean;
  onSnapping: (on: boolean) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const time = useTime(player);
  const [trim, setTrim] = useState<Trim | null>(null);
  const [drop, setDrop] = useState<{ x: number; scene: number; index: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const width = Math.max(timeline.total * pps + 240, 400);
  const snapTargets = useMemo(() => edges(timeline), [timeline]);
  const step = tickStep(pps);
  const over = fits.filter((f) => !f.fits).length;
  const selectedShot = selection?.type === 'shot'
    ? timeline.scenes[selection.scene]?.shots[selection.shot] : undefined;

  const xToTime = (clientX: number) => {
    const el = scroll.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return (clientX - rect.left + el.scrollLeft) / pps;
  };
  const snapTime = (t: number, exclude?: number) => (snapping
    ? snap(t, exclude === undefined ? snapTargets : snapTargets.filter((e) => Math.abs(e - exclude) > 1e-6), SNAP_PX / pps)
    : t);

  // ------------------------------------------------------------ playhead scrubbing

  const onRulerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    player?.pause();
    player?.seek(snapTime(xToTime(e.clientX)));
  };
  const onRulerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1 || !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    player?.seek(snapTime(xToTime(e.clientX)));
  };

  // ------------------------------------------------------------ trimming

  const trimPreview = (t: Trim, dx: number) => {
    const { shot } = t;
    const dt = dx / pps;
    if (shot.kind === 'card') {
      let length = Math.max(MIN_SHOT, shot.length + (t.side === 'right' ? dt : -dt));
      length = snapTime(shot.start + length, shot.start + shot.length) - shot.start;
      return { patch: { length: Math.max(MIN_SHOT, length) } as ShotPatch, length: Math.max(MIN_SHOT, length), source: null };
    }
    const max = shot.file ? durations[shot.file] ?? Infinity : Infinity;
    if (t.side === 'left') {
      let start = Math.min(Math.max(0, shot.in + dt * shot.speed), shot.out - MIN_SHOT);
      const end = shot.start + (shot.out - start) / shot.speed;
      const snapped = snapTime(end, shot.start + shot.length);
      if (snapped !== end) start = Math.min(Math.max(0, shot.out - (snapped - shot.start) * shot.speed), shot.out - MIN_SHOT);
      return { patch: { in: start }, length: (shot.out - start) / shot.speed, source: start };
    }
    let out = Math.max(Math.min(max, shot.out + dt * shot.speed), shot.in + MIN_SHOT);
    const end = shot.start + (out - shot.in) / shot.speed;
    const snapped = snapTime(end, shot.start + shot.length);
    if (snapped !== end) out = Math.max(Math.min(max, shot.in + (snapped - shot.start) * shot.speed), shot.in + MIN_SHOT);
    return { patch: { out }, length: (out - shot.in) / shot.speed, source: out };
  };

  const onHandleDown = (e: React.PointerEvent, shot: TimelineShot, side: 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelect({ type: 'shot', scene: shot.sceneIndex, shot: shot.shotIndex });
    setTrim({ id: shot.id, side, x0: e.clientX, shot, length: shot.length });
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!trim) return;
    const result = trimPreview(trim, e.clientX - trim.x0);
    setTrim({ ...trim, length: result.length });
    if (result.source !== null) player?.scrub(trim.shot, Math.max(0, result.source - (trim.side === 'right' ? 1 / 30 : 0)));
  };
  const onHandleUp = (e: React.PointerEvent) => {
    if (!trim) return;
    const result = trimPreview(trim, e.clientX - trim.x0);
    setTrim(null);
    player?.endScrub();
    if (Math.abs(result.length - trim.shot.length) > 1e-3) onShotPatch(trim.shot.sceneIndex, trim.shot.shotIndex, result.patch);
  };

  // ------------------------------------------------------------ drag and drop

  const dropTarget = (clientX: number) => {
    const t = xToTime(clientX);
    const shots = timeline.shots;
    const last = shots[shots.length - 1];
    if (!last) return null;
    const hit = shots.find((s) => t < s.start + s.length) ?? last;
    const after = t > hit.start + hit.length / 2;
    const x = (after ? hit.start + hit.length : hit.start) * pps;
    return { x, scene: hit.sceneIndex, index: hit.shotIndex + (after ? 1 : 0) };
  };
  const onDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (!types.includes(DRAG_TYPE) && !types.includes(MOVE_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = types.includes(MOVE_TYPE) ? 'move' : 'copy';
    setDrop(dropTarget(e.clientX));
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const target = dropTarget(e.clientX);
    setDrop(null);
    setDragging(null);
    if (!target) return;
    const move = e.dataTransfer.getData(MOVE_TYPE);
    if (move) {
      const from = JSON.parse(move) as { scene: number; shot: number };
      onEdit({ op: 'move', from, to: { scene: target.scene, index: target.index } });
      return;
    }
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (raw) onEdit({ op: 'insert', scene: target.scene, index: target.index, item: JSON.parse(raw) as BinItem });
  };

  const shotClass = (s: TimelineShot) => [
    'tl-shot', s.kind === 'card' ? 'card' : '',
    selection?.type === 'shot' && selection.scene === s.sceneIndex && selection.shot === s.shotIndex ? 'selected' : '',
    dragging === s.id ? 'dragging' : '',
  ].filter(Boolean).join(' ');

  const ticks = [];
  for (let t = 0; t <= timeline.total + step; t += step) {
    ticks.push(<div key={t} className="tl-tick mono" style={{ left: t * pps }}>{t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : `${t}s`}</div>);
  }

  return (
    <section className="panel timeline" aria-label="Timeline">
      <div className="tl-toolbar">
        <button className="icon-btn" aria-label="Split at the playhead" title="Split at the playhead (S)" disabled={!selectedShot && !timeline.shots.length}
          onClick={() => {
            const shot = timeline.shots.find((s) => time > s.start && time < s.start + s.length);
            if (shot) onEdit({ op: 'split', scene: shot.sceneIndex, shot: shot.shotIndex, at: shot.in + (time - shot.start) * shot.speed });
          }}><Scissors size={16} /></button>
        <button className="icon-btn" aria-label="Remove the selected shot" title="Remove the selected shot (Delete)" disabled={!selectedShot}
          onClick={() => selectedShot && onEdit({ op: 'remove', scene: selectedShot.sceneIndex, shot: selectedShot.shotIndex })}><Trash2 size={16} /></button>
        <button className={`icon-btn${snapping ? ' on' : ''}`} aria-pressed={snapping} aria-label="Snap to shot edges" title="Snap to shot edges" onClick={() => onSnapping(!snapping)}><Magnet size={16} /></button>
        <span className="spacer" />
        <span className={`fit-summary${over ? ' over' : ''}`} data-testid="fit-summary">
          {fits.length === 0 ? 'No voiceover lines' : over ? `${over} voiceover line${over > 1 ? 's' : ''} too long` : 'Voiceover fits'}
        </span>
        <button className="icon-btn" aria-label="Zoom out" title="Zoom out (-)" onClick={() => onZoom(Math.max(MIN_PPS, pps / 1.25))}><ZoomOut size={16} /></button>
        <input className="zoom" type="range" aria-label="Timeline zoom" min={Math.log(MIN_PPS)} max={Math.log(MAX_PPS)} step={0.01}
          value={Math.log(pps)} onChange={(e) => onZoom(Math.exp(Number(e.target.value)))} />
        <button className="icon-btn" aria-label="Zoom in" title="Zoom in (=)" onClick={() => onZoom(Math.min(MAX_PPS, pps * 1.25))}><ZoomIn size={16} /></button>
      </div>
      <div className="tl-body">
        <div className="tl-lanes" aria-hidden>
          <div style={{ height: 26 }}>Scenes</div>
          <div style={{ height: 84 }}>Shots</div>
          <div style={{ height: 26 }}>Voiceover</div>
        </div>
        <div className="tl-scroll" ref={scroll} data-testid="timeline-scroll">
          <div className="tl-content" style={{ width }} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={() => setDrop(null)}>
            <div className="tl-ruler" onPointerDown={onRulerDown} onPointerMove={onRulerMove} data-testid="ruler">{ticks}</div>
            <div className="tl-scenes">
              {timeline.scenes.map((scene) => (
                <button
                  key={scene.index} type="button"
                  className={`tl-scene${selection?.type === 'scene' && selection.scene === scene.index ? ' selected' : ''}`}
                  style={{ left: scene.start * pps, width: Math.max(scene.length * pps - 2, 12) }}
                  onClick={() => onSelect({ type: 'scene', scene: scene.index })} title={scene.name}
                >{scene.index + 1}. {scene.name}</button>
              ))}
            </div>
            <div className="tl-shots" data-testid="shots-lane">
              {timeline.shots.map((s) => {
                const length = trim?.id === s.id ? trim.length : s.length;
                const thumb = s.kind === 'clip' && s.mediaPath ? thumbUrl(s.mediaPath, s.in + 0.05, 96) : undefined;
                return (
                  <div
                    key={s.id} className={shotClass(s)} data-testid="shot" data-shot-id={s.id}
                    style={{ left: s.start * pps, width: Math.max(length * pps - 2, 6) }}
                    draggable={!trim}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(MOVE_TYPE, JSON.stringify({ scene: s.sceneIndex, shot: s.shotIndex }));
                      e.dataTransfer.effectAllowed = 'move';
                      setDragging(s.id);
                    }}
                    onDragEnd={() => { setDragging(null); setDrop(null); }}
                    onClick={() => {
                      onSelect({ type: 'shot', scene: s.sceneIndex, shot: s.shotIndex });
                      if (!player?.isPlaying) player?.seek(s.start);
                    }}
                    title={`${s.screen}${s.text ? `\nOn screen: ${s.text}` : ''}\n${s.length.toFixed(2)}s`}
                  >
                    {thumb && <div className="strip" style={{ backgroundImage: `url("${thumb}")` }} />}
                    {s.kind === 'card' && <div className="strip card-strip">{s.cardTitle}</div>}
                    {s.ref && <span className="badge">{s.ref}</span>}
                    <div className="label">{s.kind === 'card' ? s.card : s.screen || s.file}</div>
                    <div className="handle left" data-testid="handle-left" onPointerDown={(e) => onHandleDown(e, s, 'left')} onPointerMove={onHandleMove} onPointerUp={onHandleUp} />
                    <div className="handle right" data-testid="handle-right" onPointerDown={(e) => onHandleDown(e, s, 'right')} onPointerMove={onHandleMove} onPointerUp={onHandleUp} />
                  </div>
                );
              })}
              {drop && <div className="tl-drop" style={{ left: drop.x, height: '100%' }} />}
              {timeline.shots.length === 0 && <div className="tl-empty">Drag a take from the media bin to start.</div>}
            </div>
            <div className="tl-vo" data-testid="vo-lane">
              {fits.map((f) => (
                <div key={f.sceneIndex}>
                  <div
                    className={`tl-vo-bar${f.fits ? '' : ' over'}`} data-testid="vo-bar" data-fits={f.fits}
                    style={{ left: f.start * pps, width: Math.max(f.seconds * pps, 6) }}
                    title={`${f.text}\n${f.words} words, about ${f.seconds.toFixed(1)}s of speech, ${f.available.toFixed(1)}s available`}
                    onClick={() => onSelect({ type: 'scene', scene: f.sceneIndex })}
                  >{f.text}</div>
                  {!f.fits && <div className="tl-vo-limit" style={{ left: (f.start + f.available) * pps }} />}
                </div>
              ))}
            </div>
            <div className="tl-playhead" style={{ left: time * pps }} data-testid="playhead" />
          </div>
        </div>
      </div>
    </section>
  );
}
