/**
 * Lender statement math. Pure, so the screen and the server agree.
 *
 * Net wire = total loan amount
 *          - construction holdback (kept back, released later as draws)
 *          - lender points (charged on the acquisition only)
 *          - construction reserves
 *          - daily interest (acquisition, closing date through month end)
 *
 * Daily interest uses the same proration as the interest engine, so it is
 * exactly the closing-month interest the monthly statements treat as prepaid.
 */

import { drawInterest } from '@/lib/interest';

export interface Reserve { label: string; amount: number }

export interface LenderInput {
  loan_amount: number | string;
  acquisition: number | string;
  construction: number | string;
  annual_rate: number | string;   // 0.12 = 12%
  closing_date: string;           // YYYY-MM-DD
  lender_points_pct: number | string;
  reserves: Reserve[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function lenderFigures(c: LenderInput) {
  const loanAmount = Number(c.loan_amount) || 0;
  const acquisition = Number(c.acquisition) || 0;
  const construction = Number(c.construction) || 0;
  const pointsPct = Number(c.lender_points_pct) || 0;
  const points = cents(acquisition * pointsPct / 100);
  const reserves = (c.reserves ?? []).map(r => ({ label: r.label, amount: cents(Number(r.amount) || 0) }));
  const reservesTotal = cents(reserves.reduce((s, r) => s + r.amount, 0));
  const rate = Number(c.annual_rate) || 0;
  const dailyInterest = c.closing_date ? cents(drawInterest(acquisition, rate, c.closing_date)) : 0;
  const [y, m, d] = String(c.closing_date || '').slice(0, 10).split('-').map(Number);
  const monthEnd = c.closing_date ? new Date(y, m, 0).getDate() : 0;
  const interestDays = c.closing_date ? monthEnd - d + 1 : 0;
  const interestThrough = c.closing_date ? `${y}-${String(m).padStart(2, '0')}-${String(monthEnd).padStart(2, '0')}` : '';
  const netWire = cents(loanAmount - construction - points - reservesTotal - dailyInterest);
  return {
    loanAmount, acquisition, construction, pointsPct, points, reserves, reservesTotal,
    dailyInterest, interestDays, interestThrough, netWire,
  };
}

/** Keep only reserve rows that say something; amounts as numbers. */
export function cleanReserves(raw: unknown): Reserve[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({ label: String(r?.label ?? '').trim(), amount: cents(Number(r?.amount) || 0) }))
    .filter(r => r.label || r.amount);
}
