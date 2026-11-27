import { describe, expect, it } from 'vitest';
import {
  cueFromChoice, cueVoice, estimateLanding, isWordCue, normWord, offeredWords, ordinal, resolveCue, spokenWords,
} from './word-cue';

// Expected values come from the real build code. Regenerate them (9 lines, then paste) with:
//   python3 -I -c "import sys; sys.path.insert(0,'scripts'); from keynote.voice_sync import word_offsets; print(word_offsets('LINE'))"
// run from the repo root, once per line below. (word, fraction of the line spoken before it.)
const PYTHON_WORD_OFFSETS: [string, [string, number][]][] = [
  ["Start today at example dot review.", [["start", 0.0], ["today", 0.17142857142857143], ["at", 0.34285714285714286], ["example", 0.42857142857142855], ["dot", 0.6571428571428571], ["review", 0.7714285714285715]]],
  ["Our AI powered notes app", [["our", 0.0], ["ai", 0.16], ["powered", 0.28], ["notes", 0.6], ["app", 0.84]]],
  ["Hello there", [["hello", 0.0], ["there", 0.5]]],
  ["Invite your team, then invite them again.", [["invite", 0.0], ["your", 0.16666666666666666], ["team", 0.2857142857142857], ["then", 0.42857142857142855], ["invite", 0.5476190476190477], ["them", 0.7142857142857143], ["again", 0.8333333333333334]]],
  ["Don't miss the well-known x.y tool - it's fast", [["dont", 0.0], ["miss", 0.1276595744680851], ["the", 0.23404255319148937], ["wellknown", 0.3191489361702128], ["xy", 0.5531914893617021], ["tool", 0.6382978723404256], ["", 0.7446808510638298], ["its", 0.7872340425531915], ["fast", 0.8936170212765957]]],
  ["Send 3 invoices in 10 minutes \u2014 really, 10!", [["send", 0.0], ["3", 0.11363636363636363], ["invoices", 0.1590909090909091], ["in", 0.36363636363636365], ["10", 0.4318181818181818], ["minutes", 0.5], ["", 0.6818181818181818], ["really", 0.7272727272727273], ["10", 0.9090909090909091]]],
  ["  Leading   spaces\tand\nnewlines  ", [["leading", 0.0], ["spaces", 0.2857142857142857], ["and", 0.5357142857142857], ["newlines", 0.6785714285714286]]],
  ["Caf\u00e9 r\u00e9sum\u00e9 \u201cquoted\u201d words", [["caf", 0.0], ["rsum", 0.18518518518518517], ["quoted", 0.4444444444444444], ["words", 0.7777777777777778]]],
  ["- - dash", [["", 0.0], ["", 0.2222222222222222], ["dash", 0.4444444444444444]]],
];

describe('word cues match the Python build', () => {
  for (const [line, expected] of PYTHON_WORD_OFFSETS) {
    it(`gives the same words and fractions for ${JSON.stringify(line)}`, () => {
      const got = spokenWords(line);
      expect(got.map((w) => w.word)).toEqual(expected.map(([word]) => word));
      got.forEach((w, i) => expect(Math.abs(w.fraction - expected[i][1])).toBeLessThan(1e-9));
    });
  }
});

describe('normWord', () => {
  it('lowercases and strips everything except ASCII letters and digits', () => {
    expect(normWord("Don't")).toBe('dont');
    expect(normWord('well-known')).toBe('wellknown');
    expect(normWord('x.y')).toBe('xy');
    expect(normWord('Café')).toBe('caf');
    expect(normWord('—')).toBe('');
    expect(normWord('10!')).toBe('10');
  });
});

describe('spokenWords', () => {
  it('keeps tokens that normalise to empty, but never offers them', () => {
    const words = spokenWords('Fast - and cheap');
    expect(words.map((w) => w.word)).toEqual(['fast', '', 'and', 'cheap']);
    expect(offeredWords('Fast - and cheap').map((w) => w.token)).toEqual(['Fast', 'and', 'cheap']);
  });

  it('numbers repeated words by occurrence', () => {
    const words = spokenWords('Invite them, then invite more. Invite!');
    expect(words.filter((w) => w.word === 'invite').map((w) => w.nth)).toEqual([1, 2, 3]);
  });

  it('shows punctuation-trimmed words and the occurrence in the offered list', () => {
    const offered = offeredWords('Invite your team, then (invite) them.');
    expect(offered.map((w) => w.label)).toEqual(['Invite (1st)', 'your', 'team', 'then', 'invite (2nd)', 'them']);
  });

  it('counts characters, not UTF-16 units, like Python', () => {
    expect(spokenWords('\u{1F600}\u{1F600} ab')[1].fraction).toBeCloseTo(3 / 6, 12);
  });
});

describe('ordinal', () => {
  it('writes 1st, 2nd, 3rd, 4th, 11th, 12th, 21st', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st']);
  });
});

describe('resolveCue', () => {
  const line = 'Invite your team, then invite them again.';
  it('finds the word and its fraction', () => {
    expect(resolveCue({ word: 'Invite', nth: 2 }, line)).toEqual({ ok: true, fraction: 0.5476190476190477 });
    expect(resolveCue({ word: 'team' }, line)).toMatchObject({ ok: true });
  });
  it('reports no-voiceover for an empty or blank line', () => {
    expect(resolveCue({ word: 'team' }, '')).toEqual({ ok: false, reason: 'no-voiceover' });
    expect(resolveCue({ word: 'team' }, undefined)).toEqual({ ok: false, reason: 'no-voiceover' });
    expect(resolveCue({ word: 'team' }, '  \n ')).toEqual({ ok: false, reason: 'no-voiceover' });
  });
  it('reports missing-word when the word is not in the line, or normalises to nothing', () => {
    expect(resolveCue({ word: 'banana' }, line)).toEqual({ ok: false, reason: 'missing-word' });
    expect(resolveCue({ word: '--' }, line)).toEqual({ ok: false, reason: 'missing-word' });
  });
  it('reports nth-too-high when the word is said fewer times than saved', () => {
    expect(resolveCue({ word: 'invite', nth: 3 }, line)).toEqual({ ok: false, reason: 'nth-too-high' });
  });
});

describe('estimateLanding', () => {
  it('adds the lead-in, the fraction of the line and the offset', () => {
    // 10 words at 120 wpm is 5 s; half way is 2.5 s; plus 0.5 lead-in and -0.2 offset.
    const text = 'a b c d e f g h i j';
    expect(estimateLanding({ fraction: 0.5, text, rateWpm: 120, leadIn: 0.5, offset: -0.2 })).toBeCloseTo(2.8, 9);
    expect(estimateLanding({ fraction: 0, text, rateWpm: 120, leadIn: 0.5 })).toBeCloseTo(0.5, 9);
  });
});

describe('cueFromChoice', () => {
  it('omits nth when it is 1 and offset when it is 0', () => {
    expect(cueFromChoice('invite', 1, 0)).toEqual({ word: 'invite' });
    expect(Object.keys(cueFromChoice('invite', 1, 0))).toEqual(['word']);
    expect(cueFromChoice('invite', 2, -0.2)).toEqual({ word: 'invite', nth: 2, offset: -0.2 });
  });
});

describe('isWordCue', () => {
  it('tells a cue from a number', () => {
    expect(isWordCue({ word: 'a' })).toBe(true);
    expect(isWordCue(1.5)).toBe(false);
  });
});

describe('cueVoice', () => {
  // scripts/narration/core.py DEFAULT_RATE and DEFAULT_LEAD_IN: the values WordCues uses to place a cue.
  it('uses the narration defaults the build places word cues with, not the keynote fit readout', () => {
    expect(cueVoice({})).toEqual({ rateWpm: 165, leadIn: 0.3 });
  });

  it('follows the demo\'s own voice settings, as the build does', () => {
    expect(cueVoice({ voice: { rate_wpm: 140, lead_in: 0.6 } })).toEqual({ rateWpm: 140, leadIn: 0.6 });
  });

  it('estimates the same landing the build computes for an unmeasured line', () => {
    // 7 words at 165 wpm = 2.545 s; "invite" (2nd) starts 23/42 of the way in; 0.3 + 23/42 * 2.545 - 0.2.
    const text = 'Invite your team, then invite them again.';
    const fraction = 23 / 42;
    expect(estimateLanding({ fraction, text, ...cueVoice({}), offset: -0.2 })).toBeCloseTo(1.4939, 3);
  });
});
