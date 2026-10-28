/**
 * Lender statement math. Pure, so the screen and the server agree.
 *
 * Net wire = total loan amount
 *          - construction holdback (kept back, released later as draws)
 *          - lender points (a percent of the total loan amount)
 *          - interest reserve (months of interest on the total loan amount)
 *          - daily interest (acquisition, closing date through month end)
 *
 * Daily interest uses the same proration as the interest engine, so it is
 * exactly the closing-month interest the monthly statements treat as prepaid.
 */

import { drawInterest } from '@/lib/interest';

export interface LenderInput {
  loan_amount: number | string;
  acquisition: number | string;
  construction: number | string;
  annual_rate: number | string;   // 0.12 = 12%
  closing_date: string;           // YYYY-MM-DD
  lender_points_pct: number | string;
  interest_reserve_months: number | string;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function lenderFigures(c: LenderInput) {
  const loanAmount = Number(c.loan_amount) || 0;
  const acquisition = Number(c.acquisition) || 0;
  const construction = Number(c.construction) || 0;
  const rate = Number(c.annual_rate) || 0;
  const pointsPct = Number(c.lender_points_pct) || 0;
  const points = cents(loanAmount * pointsPct / 100);
  const reserveMonths = Number(c.interest_reserve_months) || 0;
  const interestReserve = cents(loanAmount * (rate / 12) * reserveMonths);
  const dailyInterest = c.closing_date ? cents(drawInterest(acquisition, rate, c.closing_date)) : 0;
  const [y, m, d] = String(c.closing_date || '').slice(0, 10).split('-').map(Number);
  const monthEnd = c.closing_date ? new Date(y, m, 0).getDate() : 0;
  const interestDays = c.closing_date ? monthEnd - d + 1 : 0;
  const interestThrough = c.closing_date ? `${y}-${String(m).padStart(2, '0')}-${String(monthEnd).padStart(2, '0')}` : '';
  const netWire = cents(loanAmount - construction - points - interestReserve - dailyInterest);
  return {
    loanAmount, acquisition, construction, rate, pointsPct, points,
    reserveMonths, interestReserve,
    dailyInterest, interestDays, interestThrough, netWire,
  };
}
