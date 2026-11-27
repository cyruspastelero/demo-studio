// Word cues: a callout's `at` can name a spoken word of the scene's own voiceover. These mirror
// scripts/keynote/voice_sync.py (norm, word_offsets, WordCues._resolve), which does the real
// work at build time. Keep them in step; word-cue.test.ts checks them against the Python output.
import { wordCount } from './fit';
import type { WordCue } from './types';

export interface SpokenWord {
  word: string; // normalised; '' when nothing is left to match
  token: string; // as written in the line
  nth: number; // 1-based occurrence of this word; 0 for a token that normalises to ''
  fraction: number; // share of the line spoken before it, as word_offsets computes it
}

export interface OfferedWord extends SpokenWord {
  display: string; // the token with punctuation trimmed off its ends
  label: string; // display, plus "(2nd)" when the word is said more than once
}

export type CueResolution =
  | { ok: true; fraction: number }
  | { ok: false; reason: 'no-voiceover' | 'missing-word' | 'nth-too-high' };

// Python's str.split() whitespace, which differs a little from JavaScript's \s.
const PY_SPACE = new RegExp('[\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]+');

export const normWord = (word: string): string => word.toLowerCase().replace(/[^0-9a-z]+/g, '');

export const isWordCue = (at: unknown): at is WordCue =>
  typeof at === 'object' && at !== null && typeof (at as WordCue).word === 'string';

export function spokenWords(text: string): SpokenWord[] {
  const tokens = text.split(PY_SPACE).filter(Boolean);
  const total = Math.max(1, tokens.reduce((n, t) => n + [...t].length + 1, 0));
  const seen = new Map<string, number>();
  let chars = 0;
  return tokens.map((token) => {
    const word = normWord(token);
    const nth = word ? (seen.get(word) ?? 0) + 1 : 0;
    if (word) seen.set(word, nth);
    const fraction = chars / total;
    chars += [...token].length + 1;
    return { word, token, nth, fraction };
  });
}

export function ordinal(n: number): string {
  const tail = n % 100;
  const suffix = tail >= 11 && tail <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

// The words a cue can name, in order. Tokens with nothing to match (a lone dash) are left out.
export function offeredWords(text: string | undefined): OfferedWord[] {
  const words = spokenWords(text ?? '').filter((w) => w.word);
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w.word, (counts.get(w.word) ?? 0) + 1);
  return words.map((w) => {
    const display = w.token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') || w.token;
    return { ...w, display, label: (counts.get(w.word) ?? 0) > 1 ? `${display} (${ordinal(w.nth)})` : display };
  });
}

export function resolveCue(cue: WordCue, text: string | undefined): CueResolution {
  const line = (text ?? '').trim();
  if (!line) return { ok: false, reason: 'no-voiceover' };
  const word = normWord(cue.word);
  const hits = word ? spokenWords(line).filter((w) => w.word === word) : [];
  if (!hits.length) return { ok: false, reason: 'missing-word' };
  const nth = cue.nth ?? 1;
  if (nth > hits.length) return { ok: false, reason: 'nth-too-high' };
  return { ok: true, fraction: hits[nth - 1].fraction };
}

// Seconds into the scene: lead-in, then the share of the estimated line, then the offset.
// The rate and lead-in the build places a word cue with (WordCues in scripts/keynote/voice_sync.py):
// the demo's own voice settings, else scripts/narration/core.py DEFAULT_RATE and DEFAULT_LEAD_IN. The
// keynote fit readout uses keynote-handoff.py's 150 wpm and 0.5 s, which would put the pill late.
export const CUE_RATE_WPM = 165;
export const CUE_LEAD_IN = 0.3;

export function cueVoice(doc: { voice?: { rate_wpm?: number; lead_in?: number } }): { rateWpm: number; leadIn: number } {
  return { rateWpm: doc.voice?.rate_wpm ?? CUE_RATE_WPM, leadIn: doc.voice?.lead_in ?? CUE_LEAD_IN };
}

export function estimateLanding(o: { fraction: number; text: string; rateWpm: number; leadIn: number; offset?: number }): number {
  const seconds = (wordCount(o.text) / o.rateWpm) * 60;
  return o.leadIn + o.fraction * seconds + (o.offset ?? 0);
}

export function cueFromChoice(word: string, nth: number, offset: number): WordCue {
  return { word, ...(nth > 1 ? { nth } : {}), ...(offset !== 0 ? { offset } : {}) };
}
