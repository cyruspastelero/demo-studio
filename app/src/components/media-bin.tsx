import { ExternalLink, Film, Layers, Type } from 'lucide-react';
import { useRef } from 'react';
import { thumbUrl } from '../api';
import type { BinItem } from '../lib/edits';
import { isClick, takeOf, type SourceTake } from '../lib/source';
import { isDemoCard } from '../lib/timeline';
import type { DemoDoc, FileKind, HandoffDoc, MediaIndex } from '../lib/types';

export const DRAG_TYPE = 'application/x-demo-studio';

function startDrag(e: React.DragEvent, item: BinItem) {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
  e.dataTransfer.effectAllowed = 'copy';
}

function seconds(value: number | null | undefined) {
  return value == null ? 'unknown length' : `${value.toFixed(1)}s`;
}

interface MediaBinProps {
  kind: FileKind;
  doc: HandoffDoc | DemoDoc | undefined;
  media: MediaIndex | null;
  viewing: string | null; // file name of the take open in the source viewer
  onSelectCard: (name: string) => void;
  onViewTake: (take: SourceTake) => void;
  onOpenTake: (take: SourceTake) => void;
}

export function MediaBin({ kind, doc, media, viewing, onSelectCard, onViewTake, onOpenTake }: MediaBinProps) {
  const pressed = useRef<{ x: number; y: number } | null>(null);
  const handoff = kind === 'handoff' ? (doc as HandoffDoc | undefined) : undefined;
  const demo = kind === 'demo' ? (doc as DemoDoc | undefined) : undefined;
  const raw = media?.raw ?? [];
  const cards = handoff ? Object.entries(handoff.cards ?? {}) : [];
  const shots = handoff ? Object.entries(handoff.shots ?? {}) : [];
  const demoCards = demo ? demo.sequence.filter(isDemoCard) : [];

  return (
    <aside className="panel bin" aria-label="Media">
      <div className="panel-head">Media</div>
      <div className="bin-body">
        <h3>Raw takes</h3>
        {raw.length === 0 && <div className="bin-empty">No takes in the raw folder yet.</div>}
        {raw.map((m) => {
          const take = takeOf(m);
          return (
            <div key={m.file} className="bin-take">
              <div
                className={`bin-item${viewing === m.file ? ' viewing' : ''}`} draggable data-testid="bin-take" data-take={m.file}
                role="button" tabIndex={0} aria-pressed={viewing === m.file}
                aria-label={`${m.file}, ${seconds(m.duration)}${m.status ? `, ${m.status}` : ''}. Press Enter to view the take.`}
                onDragStart={(e) => startDrag(e, { kind: 'raw', file: m.file, duration: m.duration })}
                onPointerDown={(e) => { pressed.current = { x: e.clientX, y: e.clientY }; }}
                onClick={(e) => { if (isClick(pressed.current, { x: e.clientX, y: e.clientY })) onViewTake(take); }}
                onDoubleClick={() => onOpenTake(take)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  onViewTake(take);
                }}
                title={`${m.file}${m.notes ? `\n${m.notes}` : ''}\nClick to view, double-click to open in the system player, drag onto the timeline to add a shot.`}
              >
                <div className="thumb" style={{ backgroundImage: `url("${thumbUrl(m.path, Math.min(1, (m.duration ?? 2) / 2), 128)}")` }} />
                <div>
                  <div className="name">{m.file}</div>
                  <div className="meta">
                    <span>{seconds(m.duration)}</span>
                    {m.status && <span className={`status-${m.status.toLowerCase()}`}>{m.status}</span>}
                  </div>
                </div>
              </div>
              <button
                className="icon-btn bin-open" data-testid="bin-take-open" aria-label={`Open ${m.file} in the system player`}
                title="Open in the system player" onClick={() => onOpenTake(take)}
              >
                <ExternalLink size={14} />
              </button>
            </div>
          );
        })}

        {handoff && (
          <>
            <h3>Title cards</h3>
            {cards.length === 0 && <div className="bin-empty">No cards in handoff.json.</div>}
            {cards.map(([name, card]) => (
              <div
                key={name} className="bin-item" draggable onClick={() => onSelectCard(name)}
                onDragStart={(e) => startDrag(e, { kind: 'card', name })}
                title={`${card.title}\nClick to edit, drag onto the timeline to add.`}
              >
                <div className="thumb" style={media?.cards[name] ? { backgroundImage: `url("/media/${media.cards[name]}")` } : undefined}>
                  {!media?.cards[name] && <Type size={16} />}
                </div>
                <div>
                  <div className="name">{name}</div>
                  <div className="meta"><span>{card.title}</span></div>
                </div>
              </div>
            ))}
            <h3>Named shots</h3>
            {shots.length === 0 && <div className="bin-empty">No named shots.</div>}
            {shots.map(([name, shot]) => {
              const path = raw.find((m) => m.file === shot.source)?.path;
              return (
                <div
                  key={name} className="bin-item" draggable
                  onDragStart={(e) => startDrag(e, { kind: 'shot', name })}
                  title={`${shot.screen}\nShared by every video that uses it. Drag onto the timeline to add.`}
                >
                  <div className="thumb" style={path ? { backgroundImage: `url("${thumbUrl(path, shot.in, 128)}")` } : undefined}>
                    {!path && <Layers size={16} />}
                  </div>
                  <div>
                    <div className="name">{name}</div>
                    <div className="meta"><span>{shot.source}</span></div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {demo && (
          <>
            <h3>Title cards</h3>
            <div
              className="bin-item" draggable onDragStart={(e) => startDrag(e, { kind: 'card', name: 'new' })}
              title="Drag onto the timeline to add a card to the sequence."
            >
              <div className="thumb"><Film size={16} /></div>
              <div><div className="name">New card</div><div className="meta"><span>2.4s</span></div></div>
            </div>
            {demoCards.map((c) => (
              <div key={c.card} className="bin-item" onClick={() => onSelectCard(c.card)} title="Click to edit">
                <div className="thumb" style={media?.keynoteCards[c.card] ? { backgroundImage: `url("/media/${media.keynoteCards[c.card]}")` } : undefined}>
                  {!media?.keynoteCards[c.card] && <Type size={16} />}
                </div>
                <div><div className="name">card-{c.card}</div><div className="meta"><span>{c.title}</span></div></div>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
