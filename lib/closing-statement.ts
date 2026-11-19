/**
 * Closing statement math. Pure, so the screen, the PDF and the server agree.
 *
 * One set of inputs makes two documents:
 *
 * LENDER STATEMENT
 *   Net wire = total loan amount
 *            - construction holdback (kept back, released later as draws)
 *            - lender points (a percent of the total loan amount)
 *            - interest reserve (the total collected, set on the loan)
 *            - daily interest (acquisition, closing date through month end)
 *
 * CLOSING STATEMENT
 *   Total closing cost = lender points + interest reserve + daily interest
 *                      + broker origination fee (a percent of the total loan amount)
 *                      + processing fee + legal fee + any other fees
 *
 * Daily interest uses the same proration as the interest engine, so it is
 * exactly the closing-month interest the monthly statements treat as prepaid.
 */

import { drawInterest } from '@/lib/interest';
import { fmtDate, money } from '@/lib/format';

export interface OtherFee { label: string; amount: number }

export interface ClosingInput {
  loan_amount: number | string;
  acquisition: number | string;
  construction: number | string;
  annual_rate: number | string;   // 0.12 = 12%
  closing_date: string;           // YYYY-MM-DD
  lender_points_pct: number | string;
  interest_reserve_months: number | string | null;   // from the loan
  interest_reserve_total: number | string | null;    // from the loan
  broker_fee_pct: number | string;
  processing_fee: number | string;
  legal_fee: number | string;
  other_fees: OtherFee[] | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function closingFigures(c: ClosingInput) {
  const loanAmount = Number(c.loan_amount) || 0;
  const acquisition = Number(c.acquisition) || 0;
  const construction = Number(c.construction) || 0;
  const rate = Number(c.annual_rate) || 0;

  // ---- lender side
  const pointsPct = Number(c.lender_points_pct) || 0;
  const points = cents(loanAmount * pointsPct / 100);
  const reserveMonths = Number(c.interest_reserve_months) || 0;
  const interestReserve = reserveMonths > 0 ? cents(Number(c.interest_reserve_total) || 0) : 0;
  const reserveMonthly = reserveMonths > 0 ? cents(interestReserve / reserveMonths) : 0;
  const dailyInterest = c.closing_date ? cents(drawInterest(acquisition, rate, c.closing_date)) : 0;
  const [y, m, d] = String(c.closing_date || '').slice(0, 10).split('-').map(Number);
  const monthEnd = c.closing_date ? new Date(y, m, 0).getDate() : 0;
  const interestDays = c.closing_date ? monthEnd - d + 1 : 0;
  const interestThrough = c.closing_date ? `${y}-${String(m).padStart(2, '0')}-${String(monthEnd).padStart(2, '0')}` : '';
  const netWire = cents(loanAmount - construction - points - interestReserve - dailyInterest);

  // ---- broker side
  const brokerPct = Number(c.broker_fee_pct) || 0;
  const brokerFee = cents(loanAmount * brokerPct / 100);
  const processingFee = cents(Number(c.processing_fee) || 0);
  const legalFee = cents(Number(c.legal_fee) || 0);
  const otherFees = cleanFees(c.other_fees);
  const totalClosingCost = cents(points + interestReserve + dailyInterest + brokerFee + processingFee + legalFee
    + otherFees.reduce((s, f) => s + f.amount, 0));

  return {
    loanAmount, acquisition, construction, rate, closingDate: String(c.closing_date || '').slice(0, 10),
    pointsPct, points, reserveMonths, reserveMonthly, interestReserve,
    dailyInterest, interestDays, interestThrough, netWire,
    brokerPct, brokerFee, processingFee, legalFee, otherFees, totalClosingCost,
  };
}

export type ClosingFigures = ReturnType<typeof closingFigures>;

/** Keep only fee rows that say something; amounts as numbers. */
export function cleanFees(raw: unknown): OtherFee[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({ label: String(r?.label ?? '').trim(), amount: cents(Number(r?.amount) || 0) }))
    .filter(r => r.label || r.amount);
}

/** One line of a statement, shared by the screen and the PDF so they match. */
export interface StatementLine { label: string; detail?: string; amount: number; deduct?: boolean }

const reserveDetail = (f: ClosingFigures) =>
  `${f.reserveMonths} month${f.reserveMonths === 1 ? '' : 's'}, about ${money(f.reserveMonthly)} a month`;

const dailyDetail = (f: ClosingFigures) =>
  `${f.interestDays} day${f.interestDays === 1 ? '' : 's'} on acquisition, ${fmtDate(f.closingDate)} – ${fmtDate(f.interestThrough)}`;

export function lenderLines(f: ClosingFigures): StatementLine[] {
  return [
    { label: 'Total Loan Amount', amount: f.loanAmount },
    { label: 'Construction Holdback', amount: f.construction, deduct: true },
    { label: 'Points to Lender', detail: `${f.pointsPct}% of total loan amount`, amount: f.points, deduct: true },
    // No reserve collected: no line at all, rather than a $0.00 one.
    ...(f.interestReserve > 0 ? [{ label: 'Interest Reserve', detail: reserveDetail(f), amount: f.interestReserve, deduct: true }] : []),
    { label: 'Daily Interest', detail: dailyDetail(f), amount: f.dailyInterest, deduct: true },
  ];
}

export function closingCostLines(f: ClosingFigures): StatementLine[] {
  return [
    { label: 'Points to Lender', detail: `${f.pointsPct}% of total loan amount`, amount: f.points },
    ...(f.interestReserve > 0 ? [{ label: 'Interest Reserve', detail: reserveDetail(f), amount: f.interestReserve }] : []),
    { label: 'Daily Interest', detail: dailyDetail(f), amount: f.dailyInterest },
    { label: 'Broker Origination Fee', detail: `${f.brokerPct}% of total loan amount`, amount: f.brokerFee },
    { label: 'Processing Fee', amount: f.processingFee },
    { label: 'Legal Fee', amount: f.legalFee },
    ...f.otherFees.map(o => ({ label: o.label || 'Other fee', amount: o.amount })),
  ];
}
