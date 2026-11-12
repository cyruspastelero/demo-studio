import { Clapperboard, Film, Gauge, LayoutGrid, Image, Keyboard, Layers, Moon, Package, Redo2, Smartphone, Sun, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SaveStatus } from '../state/use-documents';
import type { Aspect, FileKind } from '../lib/types';

export interface RenderOption {
  kind: string;
  label: string;
  detail: string;
  icon: React.ReactNode;
  enabled: boolean;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved', pending: 'Unsaved changes', saving: 'Saving', invalid: 'Not saved: fix the errors',
  error: 'Save failed', conflict: 'Changed on disk',
};

export function renderOptions(has: { handoff: boolean; demo: boolean; social: boolean; takes: boolean }, current: string): RenderOption[] {
  return [
    { kind: 'quick', label: `Quick preview (${current})`, detail: '960x540, ultrafast. A faithful check of speed changes and cards.', icon: <Gauge size={16} />, enabled: true },
    { kind: 'cards', label: 'Title cards', detail: 'title-cards.mjs: card PNGs from handoff.json', icon: <Image size={16} />, enabled: has.handoff },
    { kind: 'handoff', label: 'Editor handoff', detail: 'build-handoff.py: clips, scripts, voiceover, zip', icon: <Package size={16} />, enabled: has.handoff },
    { kind: 'keynote', label: 'Keynote cut', detail: 'build-keynote.py from demo.json', icon: <Film size={16} />, enabled: has.demo },
    { kind: 'reel', label: 'Review reel', detail: 'review-reel.py: keeper takes in story order', icon: <Layers size={16} />, enabled: has.takes },
    { kind: 'social', label: 'Social versions', detail: 'social-cut.py: 4:5 and 9:16 (needs the handoff first)', icon: <Smartphone size={16} />, enabled: has.handoff && has.social },
  ];
}

export function TopBar({
  name, fileTabs, fileKind, onFileKind, videoTabs, videoIndex, onVideo, aspect, onAspect, canUndo, canRedo, onUndo, onRedo,
  saveStatus, theme, onTheme, onShortcuts, options, rendering, onRender, onShowRender, onClose,
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
  theme: 'dark' | 'light';
  onTheme: () => void;
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
      <button className="icon-btn" aria-label="All demos" title="All demos" onClick={onClose} data-testid="close-demo"><LayoutGrid size={16} /></button>
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
      <button className="icon-btn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={onShortcuts}><Keyboard size={16} /></button>
      <button className="icon-btn" aria-label={theme === 'dark' ? 'Use the light theme' : 'Use the dark theme'} title="Switch theme" onClick={onTheme}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <div className="menu-wrap" ref={wrap}>
        <button className="btn primary" onClick={() => (rendering ? onShowRender() : setMenu(!menu))} aria-haspopup="menu" aria-expanded={menu} data-testid="render-button">
          <Clapperboard size={15} />{rendering ? 'Rendering' : 'Render'}
        </button>
        {menu && (
          <div className="menu" role="menu">
            {options.map((o, i) => (
              <div key={o.kind}>
                {i === 1 && <hr />}
                <button role="menuitem" disabled={!o.enabled} data-testid={`render-${o.kind}`} onClick={() => { setMenu(false); onRender(o.kind); }}>
                  {o.icon}<span>{o.label}</span><small>{o.detail}</small>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
