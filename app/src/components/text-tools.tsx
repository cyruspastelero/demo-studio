// The small toolbar above a selected text box: edit, size (on-screen text only), centre, reset.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlignCenterHorizontal, AlignCenterVertical, Minus, Pencil, Plus, RotateCcw } from 'lucide-react';
import type { FontInfo } from '../api';
import { TEXT_SIZE, type ShotPatch } from '../lib/edits';
import type { Point, TextVariant } from '../lib/text-layout';

interface Props {
  variant: TextVariant;
  at: Point;
  size: number;
  moved: boolean;
  boxHalf: number; // half the text box's on-screen height: the toolbar clears it
  anchor: string; // changes whenever the box moves or resizes, to re-place the toolbar
  onEdit: () => void;
  onCommit: (patch: ShotPatch) => void;
  font?: string;
  defaultFont: string;
  fonts: FontInfo[];
  onRefreshFonts: () => void;
}

export function TextTools({ variant, at, size, moved, boxHalf, anchor, onEdit, onCommit, font, defaultFont, fonts, onRefreshFonts }: Props) {
  useEffect(() => { onRefreshFonts(); }, [onRefreshFonts]); // a selected text re-reads the font list
  const place = useToolbarPlace(boxHalf, anchor);
  return (
    <div ref={place.ref} className="text-tools" role="toolbar" aria-label="Text" style={place.style}
      onPointerDown={(e) => e.stopPropagation()} data-testid="text-tools">
      <button className="icon-btn" title="Edit text (Enter)" aria-label="Edit text" onClick={onEdit}><Pencil size={14} /></button>
      {variant === 'onscreen' && (
        <>
          <button className="icon-btn" title="Smaller" aria-label="Smaller text" disabled={size <= TEXT_SIZE.min}
            onClick={() => onCommit({ textSize: size - 4 })}><Minus size={14} /></button>
          <span className="mono size" data-testid="text-size">{size}px</span>
          <button className="icon-btn" title="Larger" aria-label="Larger text" disabled={size >= TEXT_SIZE.max}
            onClick={() => onCommit({ textSize: size + 4 })}><Plus size={14} /></button>
        </>
      )}
      <span className="sep" />
      <FontSelect font={font} defaultFont={defaultFont} fonts={fonts} onRefresh={onRefreshFonts}
        onPick={(id) => onCommit({ textFont: id === defaultFont ? null : id })} />
      <span className="sep" />
      <button className="icon-btn" title="Centre across" aria-label="Centre across" onClick={() => onCommit({ textPos: [0.5, at[1]] })}><AlignCenterVertical size={14} /></button>
      <button className="icon-btn" title="Centre down" aria-label="Centre down" onClick={() => onCommit({ textPos: [at[0], 0.5] })}><AlignCenterHorizontal size={14} /></button>
      <button className="icon-btn" title="Back to the default spot" aria-label="Reset position" disabled={!moved} data-testid="text-reset"
        onClick={() => onCommit({ textPos: null, ...(variant === 'onscreen' ? { textSize: null } : {}) })}><RotateCcw size={14} /></button>
    </div>
  );
}

// Built-in fonts first, then the demo's own (files in its fonts/ folder). The list is re-read when
// the menu is opened, so a font Claude just added is there without a reload.
function FontSelect({ font, defaultFont, fonts, onRefresh, onPick }: {
  font?: string; defaultFont: string; fonts: FontInfo[]; onRefresh: () => void; onPick: (id: string) => void;
}) {
  const current = font ?? defaultFont;
  const own = fonts.filter((f) => f.source === 'demo');
  const missing = !fonts.some((f) => f.id === current);
  return (
    <select className="font-select" aria-label="Font" title="Font. Add your own: put .woff2, .ttf or .otf files in the demo's fonts/ folder"
      value={current} onFocus={onRefresh} onChange={(e) => onPick(e.target.value)} data-testid="text-font">
      {missing && <option value={current}>{current} (not found)</option>}
      <optgroup label="Built in">
        {fonts.filter((f) => f.source === 'bundled').map((f) => (
          <option key={f.id} value={f.id}>{f.name}{f.id === defaultFont ? ' (default)' : ''}</option>
        ))}
      </optgroup>
      <optgroup label={own.length ? 'This demo (fonts/)' : 'Add fonts to the demo\'s fonts/ folder'}>
        {own.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </optgroup>
    </select>
  );
}

const GAP = 10;
const EDGE = 8;

// Above the text, centred on it, but always inside the preview area: it slides along near the left
// and right edges and drops below the text when there is no room above.
function useToolbarPlace(boxHalf: number, anchor: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return undefined;
    const place = () => {
      const point = bar.parentElement?.getBoundingClientRect();
      const area = bar.closest('.stage-wrap')?.getBoundingClientRect() ?? point;
      if (!point || !area) return;
      const { width, height } = bar.getBoundingClientRect();
      const left = Math.min(Math.max(point.left - width / 2, area.left + EDGE), area.right - EDGE - width) - point.left;
      const above = point.top - boxHalf - GAP - height >= area.top + EDGE / 2;
      setStyle({ left, top: above ? -boxHalf - GAP - height : boxHalf + GAP });
    };
    place();
    // A longer font name widens the menu, and the window can change size: place it again.
    const observer = new ResizeObserver(place);
    observer.observe(bar);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [boxHalf, anchor]);
  return { ref, style };
}
