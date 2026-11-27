import { describe, expect, it } from 'vitest';
import type { CheckResult } from '../api';
import { summarizeChecks, summaryText } from './checks';

const result = (tool: CheckResult['tool'], ...rows: [CheckResult['rows'][number]['status'], string][]): CheckResult => ({
  tool, rows: rows.map(([status, item]) => ({ status, item, text: `${item} text` })),
});

describe('summarizeChecks', () => {
  it('counts each status across both checkers and lists failures before looks', () => {
    const s = summarizeChecks([result('video-gate', ['PASS', 'G1'], ['LOOK', 'G2'], ['FAIL', 'G3']), result('check-cut', ['FAIL', 'C1'], ['PASS', 'C2'])]);
    expect([s.fail, s.look, s.pass]).toEqual([2, 1, 2]);
    expect(s.shown.map((r) => r.item)).toEqual(['G3', 'C1', 'G2']);
    expect(s.passing.map((r) => r.item)).toEqual(['G1', 'C2']);
  });

  it('does not change the rows it was given', () => {
    const input = [result('video-gate', ['PASS', 'G1'], ['FAIL', 'G2'])];
    summarizeChecks(input);
    expect(input[0].rows.map((r) => r.item)).toEqual(['G1', 'G2']);
  });
});

describe('summaryText', () => {
  it('says all checks pass without counts when nothing fails or needs a look', () => {
    expect(summaryText(summarizeChecks([result('video-gate', ['PASS', 'G1'])]))).toBe('All checks pass');
  });
  it('puts failures first and agrees with the number', () => {
    expect(summaryText(summarizeChecks([result('video-gate', ['FAIL', 'G1'], ['LOOK', 'G2'], ['LOOK', 'G3'])]))).toBe('1 needs fixing, 2 worth a look');
    expect(summaryText(summarizeChecks([result('video-gate', ['FAIL', 'G1'], ['FAIL', 'G2'])]))).toBe('2 need fixing');
  });
});
