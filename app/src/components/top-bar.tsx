import { ChevronLeft, Clapperboard, Film, Gauge, Image, Keyboard, Layers, Redo2, Smartphone, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ThemeSwitch } from './theme-switch';
import type { SaveStatus } from '../state/use-documents';
import type { Aspect, FileKind } from '../lib/types';

export interface RenderOption {
  kind: string;
  group: string; // the heading it sits under in the menu
  label: string;
  detail: string; // what it is for, in one plain sentence
  output: string; // what you get and where: format, size, folder
  icon: React.ReactNode;
  enabled: boolean;
  why?: string; // why it is greyed out
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved', pending: 'Unsaved changes', saving: 'Saving', invalid: 'Not saved: fix the errors',
  error: 'Save failed', conflict: 'Changed on disk',
};

// What each export makes, said the way a person would ask for it. Paths are the defaults in recordings/.
export function renderOptions(has: { handoff: boolean; demo: boolean; social: boolean; takes: boolean }, current: string): RenderOption[] {
  return [
    { kind: 'quick', group: 'Check your edit', label: `Quick preview of ${current}`, icon: <Gauge size={16} />, enabled: true,
      detail: 'A fast, low-resolution video of this edit with its text, to check timing and cuts. Not for sharing.',
      output: `MP4 · 960×540 · recordings/exports/${current}-quick-preview.mp4` },
    { kind: 'keynote', group: 'Finished videos', label: 'Keynote video', icon: <Film size={16} />, enabled: has.demo,
      detail: 'The polished video, ready to share: titles, the app in a floating window, zooms and caption pills.',
      output: 'MP4 · 1920×1080 · recordings/exports/', why: 'Needs a demo.json plan' },
    { kind: 'social', group: 'Finished videos', label: 'Social media versions', icon: <Smartphone size={16} />, enabled: has.handoff && has.social,
      detail: 'Portrait copies of the promo for Instagram, TikTok and LinkedIn feeds, with a caption band on top.',
      output: 'MP4 · 4:5 and 9:16 · recordings/editor-handoff/social/',
      why: has.handoff ? 'Needs a social entry in handoff.json' : 'Needs a handoff.json' },
    { kind: 'cards', group: 'Images and footage', label: 'Title cards as images', icon: <Image size={16} />, enabled: has.handoff,
      detail: 'Each title card as a picture, to reuse in slides, posts or another editor.',
      output: 'PNG · 1920×1080 · recordings/editor-handoff/assets/title-cards/', why: 'Needs a handoff.json' },
    { kind: 'reel', group: 'Images and footage', label: 'Review reel', icon: <Layers size={16} />, enabled: has.takes,
      detail: 'Every kept take back to back, in story order, to look over the raw footage.',
      output: 'MP4 · 1920×1080 · recordings/exports/review-reel.mp4', why: 'Needs recorded takes' },
  ];
}

export function TopBar({
  name, fileTabs, fileKind, onFileKind, videoTabs, videoIndex, onVideo, aspect, onAspect, canUndo, canRedo, onUndo, onRedo,
  saveStatus, onShortcuts, options, rendering, onRender, onShowRender, onClose,
}: {
  name: string;
  fileTabs: FileKind[];
  fileKind: FileKind;
  onFileKind: (k: FileKind) => void;
  videoTabs: string[];
  videoIndex: number;
  onVideo: (i: number) => void;
  aspect: Aspect;
  onAspect: (a: Aspect) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  saveStatus: SaveStatus;
  onShortcuts: () => void;
  options: RenderOption[];
  rendering: boolean;
  onRender: (kind: string) => void;
  onShowRender: () => void;
  onClose: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);
  const bad = saveStatus === 'invalid' || saveStatus === 'error' || saveStatus === 'conflict';

  return (
    <header className="topbar">
      <button className="back-link" title="Back to the dashboard" onClick={onClose} data-testid="close-demo"><ChevronLeft size={16} />All demos</button>
      <span className="sep" />
      <span className="demo-name" title={name}>{name}</span>
      <span className="sep" />
      {fileTabs.length > 1 && (
        <>
          <div className="tabs" role="tablist" aria-label="File">
            {fileTabs.map((k) => (
              <button key={k} role="tab" className="tab" aria-selected={fileKind === k} onClick={() => onFileKind(k)}>{k}.json</button>
            ))}
          </div>
          <span className="sep" />
        </>
      )}
      <div className="tabs" role="tablist" aria-label="Video">
        {videoTabs.map((key, i) => (
          <button key={key} role="tab" className="tab" aria-selected={videoIndex === i} onClick={() => onVideo(i)} data-testid={`video-tab-${key}`}>{key}</button>
        ))}
      </div>
      <span className="spacer" />
      <div className="segmented" role="group" aria-label="Aspect ratio">
        {(['16:9', '4:5', '9:16'] as Aspect[]).map((a) => (
          <button key={a} aria-pressed={aspect === a} onClick={() => onAspect(a)} data-testid={`aspect-${a.replace(':', 'x')}`}>{a}</button>
        ))}
      </div>
      <span className="sep" />
      <button className="icon-btn" aria-label="Undo" title="Undo (Cmd+Z)" disabled={!canUndo} onClick={onUndo}><Undo2 size={16} /></button>
      <button className="icon-btn" aria-label="Redo" title="Redo (Cmd+Shift+Z)" disabled={!canRedo} onClick={onRedo}><Redo2 size={16} /></button>
      <span className={`save-status${bad ? ' bad' : ''}`} data-testid="save-status" data-status={saveStatus}>
        <span className={`dot${bad ? ' bad' : saveStatus === 'saved' ? '' : ' pending'}`} />{STATUS_TEXT[saveStatus]}
      </span>
      <span className="sep" />
      <ThemeSwitch />
      <button className="icon-btn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={onShortcuts}><Keyboard size={16} /></button>
      <div className="menu-wrap" ref={wrap}>
        <button className="btn primary" onClick={() => (rendering ? onShowRender() : setMenu(!menu))} aria-haspopup="menu" aria-expanded={menu} data-testid="render-button">
          <Clapperboard size={15} />{rendering ? 'Rendering' : 'Render'}
        </button>
        {menu && (
          <div className="menu render-menu" role="menu" aria-label="Export">
            <div className="render-menu-head"><b>Export</b><span>Files are saved in this demo's recordings/ folder.</span></div>
            {options.map((o, i) => (
              <div key={o.kind}>
                {o.group !== options[i - 1]?.group && <div className="render-group eyebrow" role="presentation">{o.group}</div>}
                <button role="menuitem" disabled={!o.enabled} data-testid={`render-${o.kind}`} title={o.enabled ? undefined : o.why}
                  onClick={() => { setMenu(false); onRender(o.kind); }}>
                  {o.icon}<span className="render-label">{o.label}</span>
                  <small>{o.enabled ? o.detail : `${o.why}. ${o.detail}`}</small>
                  <small className="render-output mono">{o.output}</small>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
