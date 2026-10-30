/**
 * Payoff letter math. Pure, so the screen, the PDF and the server agree.
 *
 * Total payoff = outstanding principal (everything disbursed through the
 *                through date: acquisition + construction draws)
 *              + interest from the day after interest was last paid up to
 *                the through date
 *              + the fees the admin sets (a fee of 0 is left off the letter)
 *
 * Interest follows the monthly statements exactly (lib/interest.ts): each
 * month accrues at rate / 12, spread over that month's days. A draw accrues
 * from its own date, and the acquisition's closing-month interest was
 * prepaid at closing, so it is never charged again. A full month therefore
 * comes to exactly what the statement for that month charged, and a part
 * month is prorated by days.
 */

import { chargeForPeriod, periodEndOf, type PaymentRow, type AllocationRow } from '@/lib/ledger';
import { DRAW_DESCRIPTION, type Draw } from '@/lib/interest';
import { firstOfMonth, fmtDate, money } from '@/lib/format';

/** Where payoff funds go unless a letter says otherwise. */
export const STANDARD_WIRE = [
  'THALWEI ABSTRACT',
  '24 Parker St. Suite 202',
  'Spring Valley, NY 10977',
  'Account # 823195398',
  '',
  'Chase',
  '270 Park Avenue',
  'New York, NY 10017',
  'ABA# 021000021',
].join('\n');

export interface PayoffLoan {
  loan_amount: number | string;
  acquisition: number | string;
  annual_rate: number | string;   // 0.12 = 12%
  closing_date: string;           // YYYY-MM-DD
}

export interface PayoffInput {
  through_date: string;           // YYYY-MM-DD
  interest_from?: string | null;  // null = follow the last payment
  demand_prep_fee?: number | string;
  wiring_fee?: number | string;
  discharge_fee?: number | string;
  draw_fee?: number | string;     // per draw
  late_fee?: number | string;
  prepayment_pct?: number | string;
}

export interface PayoffLine { label: string; amount: number }

const cents = (n: number) => Math.round(n * 100) / 100;
const parse = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const dim = (s: string) => { const d = parse(s); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };

function engineLoan(loan: PayoffLoan) {
  return {
    loan_amount: Number(loan.loan_amount) || 0, acquisition: Number(loan.acquisition) || 0,
    annual_rate: Number(loan.annual_rate) || 0, closing_date: loan.closing_date,
  };
}

/**
 * The day interest starts by default: the day after the last month whose
 * interest has been paid in full, counting months in order from closing.
 * A month with nothing charged counts as settled.
 */
export function autoInterestFrom(
  loan: PayoffLoan, draws: Draw[], allocations: AllocationRow[], throughDate: string,
): { from: string; paidThrough: string | null } {
  const eng = engineLoan(loan);
  const paid = new Map<string, number>();
  for (const a of allocations) {
    const k = firstOfMonth(a.period_month);
    paid.set(k, (paid.get(k) ?? 0) + Number(a.amount));
  }
  const lastMonth = firstOfMonth(throughDate);
  let paidThrough: string | null = null;
  for (let p = firstOfMonth(loan.closing_date), i = 0; p <= lastMonth && i < 600; p = firstOfMonth(p, 1), i++) {
    const charge = chargeForPeriod(eng, draws, p);
    if ((paid.get(p) ?? 0) + 0.005 < charge) break;
    paidThrough = periodEndOf(p);
  }
  return { from: paidThrough ? addDays(paidThrough, 1) : loan.closing_date, paidThrough };
}

/** Interest on everything disbursed, from `from` through `through`, both days included. */
export function interestBetween(loan: PayoffLoan, draws: Draw[], from: string, through: string): number {
  if (from > through) return 0;
  const rate = Number(loan.annual_rate) || 0;
  const closingMonth = firstOfMonth(loan.closing_date);
  const money = [
    { date: loan.closing_date.slice(0, 10), amount: Number(loan.acquisition) || 0, acquisition: true },
    ...draws.filter(d => d.description === DRAW_DESCRIPTION)
      .map(d => ({ date: d.draw_date.slice(0, 10), amount: Number(d.amount) || 0, acquisition: false })),
  ];
  let total = 0;
  for (let m = firstOfMonth(from), i = 0; m <= firstOfMonth(through) && i < 600; m = firstOfMonth(m, 1), i++) {
    const winStart = from > m ? from : m;
    const end = periodEndOf(m);
    const winEnd = through < end ? through : end;
    const days = dim(m);
    for (const x of money) {
      if (x.date > winEnd) continue;
      if (x.acquisition && m === closingMonth) continue;   // prepaid at closing
      const start = x.date > winStart ? x.date : winStart;
      const n = (parse(winEnd).getTime() - parse(start).getTime()) / 86_400_000 + 1;
      total += x.amount * (rate / 12) / days * Math.round(n);
    }
  }
  return total;
}

export function payoffFigures(
  loan: PayoffLoan, draws: Draw[], payments: PaymentRow[], allocations: AllocationRow[], p: PayoffInput,
) {
  const through = p.through_date.slice(0, 10);
  const rate = Number(loan.annual_rate) || 0;
  const construction = draws.filter(d => d.description === DRAW_DESCRIPTION && d.draw_date.slice(0, 10) <= through);
  const principal = cents(construction.reduce((s, d) => s + Number(d.amount), Number(loan.acquisition) || 0));

  const auto = autoInterestFrom(loan, draws, allocations, through);
  const from = (p.interest_from || auto.from).slice(0, 10);
  const grossInterest = cents(interestBetween(loan, draws, from, through));
  // Payments already applied to months inside the interest window (a part
  // payment on a month) come off, so nothing is charged twice.
  const fromMonth = firstOfMonth(from), throughMonth = firstOfMonth(through);
  const alreadyPaid = from > through ? 0 : cents(allocations
    .filter(a => { const k = firstOfMonth(a.period_month); return k >= fromMonth && k <= throughMonth; })
    .reduce((s, a) => s + Number(a.amount), 0));
  const paidTotal = payments.reduce((s, x) => s + Number(x.amount), 0);
  const appliedTotal = allocations.reduce((s, a) => s + Number(a.amount), 0);
  const unapplied = cents(Math.max(0, paidTotal - appliedTotal));

  const drawFee = cents(Number(p.draw_fee) || 0);
  const prepaymentPct = Number(p.prepayment_pct) || 0;
  const fees = {
    demandPrep: cents(Number(p.demand_prep_fee) || 0),
    wiring: cents(Number(p.wiring_fee) || 0),
    discharge: cents(Number(p.discharge_fee) || 0),
    drawFeeTotal: cents(drawFee * construction.length),
    late: cents(Number(p.late_fee) || 0),
    prepayment: cents(principal * prepaymentPct / 100),
  };

  const lines: PayoffLine[] = [{ label: 'Outstanding Principal Balance', amount: principal }];
  if (from <= through) lines.push({ label: `Interest ${fmtDate(from)} – ${fmtDate(through)}`, amount: grossInterest });
  if (alreadyPaid > 0) lines.push({ label: 'Less: Interest Already Paid', amount: -alreadyPaid });
  if (fees.demandPrep) lines.push({ label: 'Demand Prep Fee', amount: fees.demandPrep });
  if (fees.wiring) lines.push({ label: 'Wiring & Processing Fee', amount: fees.wiring });
  if (fees.discharge) lines.push({ label: 'Discharge Fee', amount: fees.discharge });
  if (fees.drawFeeTotal) {
    lines.push({ label: `Draw Fee (${construction.length} draw${construction.length === 1 ? '' : 's'} × ${money(drawFee)})`, amount: fees.drawFeeTotal });
  }
  if (fees.late) lines.push({ label: 'Late Fee', amount: fees.late });
  if (fees.prepayment) lines.push({ label: `Prepayment Penalty (${prepaymentPct}% of principal)`, amount: fees.prepayment });
  const total = cents(lines.reduce((s, l) => s + l.amount, 0));

  // After the through date interest keeps running on the whole principal,
  // at the next month's daily rate.
  const dayAfter = addDays(through, 1);
  const perDiem = cents(principal * (rate / 12) / dim(dayAfter));

  return {
    through, from, autoFrom: auto.from, paidThrough: addDays(from, -1),
    principal, drawCount: construction.length, grossInterest, alreadyPaid, unapplied,
    fees, drawFee, prepaymentPct, lines, total, perDiem, validUntil: dayAfter,
  };
}

export type PayoffFigures = ReturnType<typeof payoffFigures>;

/** "December 1, 2026", for the letter's own wording. */
export function longDate(s: string): string {
  return parse(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Last day of the month a date falls in, the usual payoff through date. */
export function monthEnd(s: string): string {
  return periodEndOf(firstOfMonth(s));
}
