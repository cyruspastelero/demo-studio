// How on-screen text looks and where it sits, in 1920x1080 frame px. The editor's preview and
// scripts/text-overlays.mjs (the exported PNGs and Quick preview) both use this, so the text lands
// on the same pixels. The keynote pill's look lives in scripts/keynote-page.mjs; .pill mirrors it.

// Glyph rendering settings shared with keynote-page.mjs, so the same font sets the same widths.
export const TEXT_BOX_CSS = `
.text-box { position: absolute; left: 0; top: 0; width: max-content; box-sizing: border-box;
  -webkit-font-smoothing: antialiased; font-optical-sizing: auto; font-kerning: normal; text-rendering: geometricPrecision; }
.text-box.onscreen { max-width: 1340px; padding: 18px 28px; border-radius: 10px; background: rgba(17, 18, 20, 0.82);
  color: #fff; font-weight: 650; letter-spacing: -0.3px; line-height: 1.2; }
.text-box.pill { display: flex; align-items: center; height: 68px; padding: 16px 32px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.95); color: #171717; font-size: 30px; font-weight: 500; letter-spacing: -0.3px;
  line-height: 1; white-space: nowrap; box-shadow: 0 14px 40px rgba(60, 45, 60, 0.12), 0 2px 6px rgba(60, 45, 60, 0.06); }
`;

export const FRAME = { W: 1920, H: 1080 };
export const DEFAULT_FONT = 'inter';

// The CSS family name a font id is loaded under (see scripts/fonts.mjs). Ids only hold safe
// characters; this keeps it a plain identifier so it can sit in a quoted CSS string anywhere.
// A short hash of the id keeps "My Font.ttf" and "My-Font.ttf" apart. Same rule as font_family() in
// scripts/keynote/overlay.py: FNV-1a 32-bit over the id's characters (ids are ASCII), 8 hex digits.
export function fontFamily(id) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return `dsf-${id.replace(/[^A-Za-z0-9]+/g, '-')}-${hash.toString(16).padStart(8, '0')}`;
}

// The CSS font-family value for a text box: the chosen font, then a plain fallback.
export function fontStack(id) {
  return `'${fontFamily(id || DEFAULT_FONT)}', sans-serif`;
}
export const TEXT_SIZE = { min: 20, max: 160, default: 44 };
// keynote-page.mjs: the pill is centred at y 962.
export const DEFAULT_POS = { onscreen: [0.5, 0.88], pill: [0.5, 962 / 1080] };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// The saved point is where the text was put; if the box has since grown (a longer line, a bigger
// size, another font) past an edge, it is drawn pushed back inside the frame.
export function keepInside(point, box) {
  const axis = (value, size) => (size >= 1 ? 0.5 : clamp(value, size / 2, 1 - size / 2));
  return [axis(point[0], box.w), axis(point[1], box.h)];
}
