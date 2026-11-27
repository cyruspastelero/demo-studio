import type { CheckResult, CheckRow, CheckStatus } from '../api';

export const CHECK_LABEL: Record<CheckStatus, string> = { FAIL: 'Needs fixing', LOOK: 'Worth a look', PASS: 'Passes' };

export interface CheckSummary {
  fail: number;
  look: number;
  pass: number;
  // FAIL rows first, then LOOK, then PASS; each group keeps the checkers' own order.
  shown: CheckRow[];
  passing: CheckRow[];
}

const order: Record<CheckStatus, number> = { FAIL: 0, LOOK: 1, PASS: 2 };

export function summarizeChecks(results: CheckResult[]): CheckSummary {
  const rows = results.flatMap((r) => r.rows);
  const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status]);
  const count = (status: CheckStatus) => rows.filter((r) => r.status === status).length;
  return {
    fail: count('FAIL'), look: count('LOOK'), pass: count('PASS'),
    shown: sorted.filter((r) => r.status !== 'PASS'), passing: sorted.filter((r) => r.status === 'PASS'),
  };
}

// "2 need fixing, 1 worth a look" or "all checks pass"; the quiet case has no counts.
export function summaryText(s: CheckSummary): string {
  if (!s.fail && !s.look) return 'All checks pass';
  const parts = [];
  if (s.fail) parts.push(`${s.fail} ${s.fail === 1 ? 'needs' : 'need'} fixing`);
  if (s.look) parts.push(`${s.look} worth a look`);
  return parts.join(', ');
}
