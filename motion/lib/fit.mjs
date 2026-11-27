// Text fitting: wrap words into lines and shrink the font until the block fits the box.
// `measure(text, sizePx)` returns the rendered width; injected so this runs in tests without a browser.

/** Greedy wrap at a given size. A single word wider than maxWidth gets its own line (caller shrinks). */
export function wrap(words, measure, sizePx, maxWidth) {
  const lines = [];
  let line = [];
  for (const word of words) {
    const candidate = [...line, word].join(' ');
    if (line.length && measure(candidate, sizePx) > maxWidth) {
      lines.push(line);
      line = [word];
    } else {
      line.push(word);
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

/**
 * Wrap whole groups (phrases) per line where possible; a group wider than the line falls back to
 * word wrapping. groups: word counts per phrase, summing to words.length.
 */
export function wrapGroups(words, groups, measure, sizePx, maxWidth) {
  const lines = [];
  let line = [];
  let k = 0;
  for (const n of groups) {
    const group = words.slice(k, k + n);
    k += n;
    const candidate = [...line, ...group].join(' ');
    if (measure(candidate, sizePx) <= maxWidth) { line.push(...group); continue; }
    if (line.length) lines.push(line);
    if (measure(group.join(' '), sizePx) <= maxWidth) { line = [...group]; continue; }
    const parts = wrap(group, measure, sizePx, maxWidth);
    line = parts.pop();
    lines.push(...parts);
  }
  if (line.length) lines.push(line);
  return lines;
}

/** Re-wrap to the same number of lines with the narrowest width, so lines come out even. */
export function balance(words, measure, sizePx, maxWidth, lineCount) {
  if (lineCount < 2) return wrap(words, measure, sizePx, maxWidth);
  let lo = maxWidth / lineCount, hi = maxWidth;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const lines = wrap(words, measure, sizePx, mid);
    const fits = lines.length <= lineCount && lines.every((l) => measure(l.join(' '), sizePx) <= mid);
    if (fits) hi = mid; else lo = mid;
  }
  return wrap(words, measure, sizePx, hi);
}

/**
 * Largest size <= baseSize (stepping down 4%) where every line fits maxWidth, there are at most
 * maxLines lines and the block (lines * lineHeight) fits maxHeight. Never goes under minSize; if it
 * still does not fit at minSize it reports overflow so the caller can fail loudly instead of clipping.
 */
export function fitText(words, measure, { baseSize, minSize, maxWidth, maxHeight = Infinity, maxLines = 3, lineHeight = 1.1, groups = null }) {
  if (!words.length) return { size: baseSize, lines: [], overflow: false };
  const layout = (size) => {
    if (groups && groups.length > 1) return wrapGroups(words, groups, measure, size, maxWidth);
    const plain = wrap(words, measure, size, maxWidth);
    return balance(words, measure, size, maxWidth, plain.length);
  };
  let size = baseSize;
  for (;;) {
    const lines = layout(size);
    const widest = Math.max(...lines.map((l) => measure(l.join(' '), size)));
    const fits = widest <= maxWidth && lines.length <= maxLines && lines.length * size * lineHeight <= maxHeight;
    if (fits) return { size, lines, overflow: false };
    const next = size * 0.96;
    if (next < minSize) {
      const minLines = wrap(words, measure, minSize, maxWidth);
      const minWidest = Math.max(...minLines.map((l) => measure(l.join(' '), minSize)));
      const overflow = minWidest > maxWidth || minLines.length > maxLines || minLines.length * minSize * lineHeight > maxHeight;
      return { size: minSize, lines: minLines, overflow };
    }
    size = next;
  }
}

/** Parse "Every *demo* video" into [{text, accent}] words. Asterisks mark accent words (may span words). */
export function parseAccent(text) {
  const words = [];
  let accent = false;
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let word = raw;
    let starts = false, ends = false;
    if (word.startsWith('*')) { starts = true; word = word.slice(1); }
    if (word.endsWith('*')) { ends = true; word = word.slice(0, -1); }
    else if (/\*[.,!?:;]$/.test(word)) { ends = true; word = word.replace(/\*([.,!?:;])$/, '$1'); }
    if (starts) accent = true;
    words.push({ text: word, accent });
    if (ends) accent = false;
  }
  return words;
}
