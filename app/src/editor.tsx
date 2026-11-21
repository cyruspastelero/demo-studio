import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type FileState, type RenderState, type Session } from './api';
import { Inspector } from './components/inspector';
import { MediaBin } from './components/media-bin';
import { Modal, ShortcutsOverlay, Toasts, type Toast } from './components/overlays';
import { Preview } from './components/preview';
import { RenderDrawer } from './components/render-drawer';
import { SourceViewer } from './components/source-viewer';
import { Timeline } from './components/timeline';
import { renderOptions, TopBar } from './components/top-bar';
import { isPlaceholderTitle } from '../shared/placeholder.mjs';
import { applyEdit, EditError, refUses, type Edit, type RefMode, type ShotPatch } from './lib/edits';
import { voiceoverFits } from './lib/fit';
import { socialEntry } from './lib/geometry';
import type { Player } from './lib/player';
import { markPatch, markTarget, type Mark, type SourceControls, type SourceTake } from './lib/source';
import { buildDemoTimeline, buildHandoffTimeline, isRefShot } from './lib/timeline';
import type { Aspect, DemoDoc, FileKind, HandoffDoc, MediaIndex, Selection, Timeline as TimelineModel } from './lib/types';
import { useDocuments } from './state/use-documents';
import { useEvents } from './state/use-events';
import { useShortcuts } from './state/use-shortcuts';

const KINDS: FileKind[] = ['handoff', 'demo'];
const ASPECTS: Aspect[] = ['16:9', '4:5', '9:16'];
const TOAST_MS = 5000;
const EMPTY: TimelineModel = { scenes: [], shots: [], total: 0, rateWpm: 165, leadIn: 0.3 };

type EditorSession = Extract<Session, { mode: 'editor' }>;

const isTemplate = (data: unknown) => isPlaceholderTitle((data as { title?: unknown } | null)?.title);

function templateNotice(kind: FileKind, others: FileKind[]): string {
  const name = `${kind}.json`;
  const stage = kind === 'handoff' ? 'run the handoff stage' : 'plan the demo';
  const other = others.filter((k) => k !== kind)[0];
  return `${name} is still the template: ${stage}${other ? ` or switch to ${other}.json` : ''}.`;
}

export function Editor({ session, onClose }: {
  session: EditorSession; onClose: () => void;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS);
  }, []);
  const docs = useDocuments(session.files, notify);
  const fileTabs = KINDS.filter((k) => session.files[k]?.data);
  // Open on a file that holds a real cut: a handoff.json still carrying the template's title was
  // never filled in, and its placeholder scenes would read as lost edits.
  const [fileKind, setFileKind] = useState<FileKind>(() =>
    fileTabs.find((k) => !isTemplate(session.files[k]?.data)) ?? fileTabs[0] ?? 'handoff');
  const [videoIndex, setVideoIndex] = useState(0);
  const [aspect, setAspect] = useState<Aspect>('16:9');
  const [selection, setSelection] = useState<Selection>(null);
  const [pps, setPps] = useState(36);
  const [snapping, setSnapping] = useState(true);
  const [loop, setLoop] = useState(false);
  const [media, setMedia] = useState<MediaIndex | null>(null);
  const [job, setJob] = useState<RenderState | null>(session.render);
  const [drawer, setDrawer] = useState(Boolean(session.render && session.render.status === 'running'));
  const [help, setHelp] = useState(false);
  const [refAsk, setRefAsk] = useState<{ scene: number; shot: number; patch: ShotPatch; ref: string } | null>(null);
  const refChoice = useRef(new Map<string, RefMode>());
  const [player, setPlayer] = useState<Player | null>(null);
  // The raw take open in the source viewer, and the cut playhead to return to.
  const [source, setSource] = useState<{ take: SourceTake; returnTo: number } | null>(null);
  const sourceControls = useRef<SourceControls | null>(null);
  const onSourceControls = useCallback((c: SourceControls | null) => { sourceControls.current = c; }, []);

  const doc = docs.docs[fileKind] as HandoffDoc | DemoDoc | undefined;
  const handoff = docs.docs.handoff as HandoffDoc | undefined;
  const videoKey = fileKind === 'handoff' ? handoff?.videos?.[videoIndex]?.key : 'KEYNOTE';

  const loadMedia = useCallback(() => {
    api.media().then(setMedia).catch((e: Error) => notify(`Could not list the media: ${e.message}`, 'error'));
  }, [notify]);
  useEffect(loadMedia, [loadMedia]);

  useEvents({
    'file-changed': (file: FileState & { kind: FileKind }) => docs.onOutsideChange(file),
    'media-changed': () => loadMedia(),
    render: (state: RenderState) => setJob(state),
    'render-line': (line: { id: number; stream: string; line: string; progress: RenderState['progress']; outputFiles: RenderState['outputFiles']; outputs: string[] }) =>
      setJob((j) => (j && j.id === line.id ? { ...j, progress: line.progress, outputs: line.outputs, outputFiles: line.outputFiles, log: [...j.log, { stream: line.stream, line: line.line }].slice(-2000) } : j)),
  });

  const durations = useMemo(() => Object.fromEntries((media?.raw ?? []).map((m) => [m.file, m.duration])), [media]);
  const built = useMemo((): { timeline: TimelineModel; error?: string } => {
    if (!doc) return { timeline: EMPTY, error: `${fileKind}.json could not be read.` };
    try {
      return { timeline: fileKind === 'handoff' ? buildHandoffTimeline(doc as HandoffDoc, videoIndex, media ?? undefined) : buildDemoTimeline(doc as DemoDoc, media ?? undefined) };
    } catch (error) {
      return { timeline: EMPTY, error: (error as Error).message };
    }
  }, [doc, fileKind, videoIndex, media]);
  const { timeline } = built;
  const fits = useMemo(() => voiceoverFits(timeline), [timeline]);
  const missing = useMemo(() => new Set(media ? timeline.shots.filter((s) => s.kind === 'clip' && s.file && !media.raw.some((m) => m.file === s.file)).map((s) => s.file as string) : []), [timeline, media]);
  const selectedShot = selection?.type === 'shot' ? timeline.scenes[selection.scene]?.shots[selection.shot] : undefined;

  useEffect(() => {
    player?.setLoop(loop && selectedShot ? { start: selectedShot.start, end: selectedShot.start + selectedShot.length } : null);
  }, [player, loop, selectedShot]);
  useEffect(() => { refChoice.current.clear(); }, [selectedShot?.id]);

  const runEdit = useCallback((edit: Edit) => {
    if (!doc) return;
    try {
      const next = applyEdit(fileKind, doc, videoIndex, edit, durations);
      docs.apply(fileKind, () => next);
      if (edit.op === 'remove' || edit.op === 'removeScene' || edit.op === 'move') setSelection(null);
    } catch (error) {
      if (error instanceof EditError) notify(error.message, 'error');
      else throw error;
    }
  }, [doc, fileKind, videoIndex, durations, docs, notify]);

  const onShotPatch = useCallback((scene: number, shot: number, patch: ShotPatch) => {
    const spec = fileKind === 'handoff' ? (doc as HandoffDoc).videos[videoIndex]?.scenes[scene]?.shots[shot] : undefined;
    if (spec && isRefShot(spec)) {
      const mode = refChoice.current.get(`${scene}:${shot}`);
      if (mode) runEdit({ op: 'shot', scene, shot, patch, mode });
      else setRefAsk({ scene, shot, patch, ref: spec.ref });
      return;
    }
    runEdit({ op: 'shot', scene, shot, patch });
  }, [doc, fileKind, videoIndex, runEdit]);

  const startRender = async (kind: string) => {
    const ok = (await Promise.all(fileTabs.map((k) => docs.saveNow(k)))).every(Boolean);
    if (!ok) {
      notify('Save the changes first: fix the errors shown in the inspector.', 'error');
      return;
    }
    try {
      const state = await api.render(kind, kind === 'quick' ? videoKey : undefined);
      setJob(state);
      setDrawer(true);
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  };

  const splitAtPlayhead = () => {
    const t = player?.time ?? 0;
    const shot = timeline.shots.find((s) => t > s.start && t < s.start + s.length);
    if (shot) runEdit({ op: 'split', scene: shot.sceneIndex, shot: shot.shotIndex, at: shot.in + (t - shot.start) * shot.speed });
  };

  const viewTake = (take: SourceTake) => {
    player?.pause();
    setSource((open) => ({ take, returnTo: open?.returnTo ?? player?.time ?? 0 }));
  };
  const closeSource = () => {
    if (!source) return;
    const { take, returnTo } = source;
    setSource(null);
    player?.seek(returnTo);
    // Back to the take in the bin, so the keyboard picks up where it left off.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-take="${CSS.escape(take.file)}"]`)?.focus());
  };
  const openTakeExternally = (take: SourceTake) => {
    api.reveal(`${session.folder}/${take.path}`, 'open').catch((e: Error) => notify(`Could not open ${take.file}: ${e.message}`, 'error'));
  };
  const markShot = source ? markTarget(selectedShot, source.take.file) : undefined;
  const mark = (which: Mark, time = sourceControls.current?.time() ?? 0) => {
    if (!markShot) return;
    const result = markPatch(markShot, which, time);
    if ('error' in result) {
      notify(result.error, 'error');
      return;
    }
    onShotPatch(markShot.sceneIndex, markShot.shotIndex, result.patch);
  };
  const src = () => sourceControls.current;

  useShortcuts(source ? {
    toggle: () => src()?.toggle(),
    play: () => src()?.play(),
    pause: () => src()?.pause(),
    seekBy: (s) => src()?.seekBy(s),
    step: (f) => src()?.step(f),
    home: () => src()?.home(),
    end: () => src()?.end(),
    loop: () => mark('out'),
    markIn: () => mark('in'),
    escape: closeSource,
    split: () => undefined,
    remove: () => undefined,
    undo: docs.undo,
    redo: docs.redo,
    zoom: (f) => setPps((p) => Math.min(240, Math.max(8, p * f))),
    aspect: (i) => setAspect(ASPECTS[i]),
    help: () => setHelp((h) => !h),
  } : {
    toggle: () => player?.toggle(),
    play: () => player?.play(),
    pause: () => player?.pause(),
    seekBy: (s) => player?.seek(player.time + s),
    step: (f) => player?.step(f),
    home: () => player?.seek(0),
    end: () => player?.seek(timeline.total),
    loop: () => setLoop((l) => !l),
    split: splitAtPlayhead,
    remove: () => selectedShot && runEdit({ op: 'remove', scene: selectedShot.sceneIndex, shot: selectedShot.shotIndex }),
    undo: docs.undo,
    redo: docs.redo,
    zoom: (f) => setPps((p) => Math.min(240, Math.max(8, p * f))),
    aspect: (i) => setAspect(ASPECTS[i]),
    help: () => setHelp((h) => !h),
    escape: () => undefined,
    markIn: () => undefined,
  }, !help && !refAsk && !docs.conflict);

  const has = {
    handoff: Boolean(session.files.handoff), demo: Boolean(session.files.demo),
    social: Boolean(handoff?.social?.length), takes: Boolean(media?.raw.length),
  };
  const entry = socialEntry(fileKind === 'handoff' ? handoff?.social : undefined, fileKind === 'handoff' ? videoKey : undefined, aspect);
  const videoTabs = fileKind === 'handoff' ? (handoff?.videos ?? []).map((v) => v.key) : ['KEYNOTE'];

  return (
    <div className="editor">
      <TopBar
        name={session.name} fileTabs={fileTabs} fileKind={fileKind}
        onFileKind={(k) => { setFileKind(k); setVideoIndex(0); setSelection(null); }}
        videoTabs={videoTabs} videoIndex={fileKind === 'handoff' ? videoIndex : 0}
        onVideo={(i) => { setVideoIndex(i); setSelection(null); }}
        aspect={aspect} onAspect={setAspect}
        canUndo={docs.canUndo} canRedo={docs.canRedo} onUndo={docs.undo} onRedo={docs.redo}
        saveStatus={docs.status[fileKind]} onShortcuts={() => setHelp(true)}
        options={renderOptions(has, videoKey ?? '')} rendering={job?.status === 'running'}
        onRender={startRender} onShowRender={() => setDrawer(true)} onClose={onClose}
      />
      <MediaBin kind={fileKind} doc={doc} media={media} viewing={source?.take.file ?? null}
        onSelectCard={(name) => setSelection({ type: 'card', name })} onViewTake={viewTake} onOpenTake={openTakeExternally} />
      <Preview kind={fileKind} timeline={timeline} aspect={aspect} social={entry} brand={handoff?.brand}
        missing={missing} loop={loop} onToggleLoop={() => setLoop((l) => !l)} onPlayer={setPlayer}
        overlay={source && (
          <SourceViewer take={source.take} markable={Boolean(markShot)} onMark={mark} onClose={closeSource}
            onOpenExternal={() => openTakeExternally(source.take)} onControls={onSourceControls} />
        )} />
      {doc ? (
        <Inspector kind={fileKind} doc={doc} videoIndex={videoIndex} timeline={timeline} selection={selection}
          onSelect={setSelection} onEdit={runEdit} onShotPatch={onShotPatch} durations={durations} fits={fits}
          notice={isTemplate(doc) ? templateNotice(fileKind, fileTabs) : undefined}
          errors={built.error ? [built.error, ...docs.errors[fileKind]] : docs.errors[fileKind]} />
      ) : <aside className="panel inspector"><div className="inspector-body"><div className="note bad">{built.error}</div></div></aside>}
      <Timeline timeline={timeline} pps={pps} onZoom={setPps} player={player} selection={selection} onSelect={setSelection}
        onEdit={runEdit} onShotPatch={onShotPatch} fits={fits} durations={durations} snapping={snapping} onSnapping={setSnapping} />

      {drawer && job && <RenderDrawer job={job} onClose={() => setDrawer(false)} onError={(m) => notify(m, 'error')} />}
      {help && <ShortcutsOverlay onClose={() => setHelp(false)} />}
      {refAsk && handoff && (
        <Modal title={`Change the shared shot ${refAsk.ref}?`} onClose={() => setRefAsk(null)}>
          <p>This shot reuses the named shot <b>{refAsk.ref}</b>, which appears {refUses(handoff, refAsk.ref)} time(s) across the videos.</p>
          <div className="actions">
            <button className="btn" onClick={() => setRefAsk(null)}>Cancel</button>
            {(['override', 'shared'] as RefMode[]).map((mode) => (
              <button key={mode} className={`btn${mode === 'shared' ? '' : ' primary'}`} data-testid={`ref-${mode}`}
                onClick={() => {
                  refChoice.current.set(`${refAsk.scene}:${refAsk.shot}`, mode);
                  runEdit({ op: 'shot', scene: refAsk.scene, shot: refAsk.shot, patch: refAsk.patch, mode });
                  setRefAsk(null);
                }}>
                {mode === 'shared' ? 'Change it everywhere' : `Only in ${videoKey}`}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {docs.conflict && (
        <Modal title={`${docs.conflict.kind}.json changed on disk`}>
          <p>Someone (maybe Claude) edited {docs.conflict.kind}.json while you had unsaved changes here. Which version do you want to keep?</p>
          {docs.conflict.diskErrors.length > 0 && <div className="note bad">The version on disk has problems: {docs.conflict.diskErrors.slice(0, 3).join('; ')}</div>}
          <div className="actions">
            <button className="btn" disabled={!docs.conflict.data} onClick={() => docs.resolveConflict('disk')} data-testid="conflict-disk">Use the file on disk</button>
            <button className="btn primary" onClick={() => docs.resolveConflict('mine')} data-testid="conflict-mine">Keep my changes</button>
          </div>
        </Modal>
      )}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
