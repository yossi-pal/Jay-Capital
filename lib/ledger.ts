import { buildStatement, cents, type Loan, type Draw } from '@/lib/interest';
import { firstOfMonth, monthName, todayInAppTz } from '@/lib/format';

/**
 * Jay Capital -- statement ledger.
 *
 * Sits ON TOP of lib/interest.ts, which is left untouched. That module
 * answers "what interest was charged for period P". This one answers
 * "what does the borrower owe today, given what they've been charged and
 * what they've paid".
 *
 * MODEL
 *   A CHARGE is one statement period's interest. It is computed, never
 *   stored -- charge(P) === buildStatement(..., P + 1 month).amountDue.
 *
 *   The running balance is DATE-based, which is how a borrower reads a
 *   statement:
 *       Previous Balance   = all charges before P, less all payments dated before P
 *       Less Payments      = payments dated inside P
 *       Plus Current Charges = charge(P)
 *       = Amount Due
 *
 *   The "unpaid previous charges" breakdown is ALLOCATION-based: it shows
 *   which specific months are still open, using what the admin applied each
 *   payment to. If payments have been recorded but not applied to a month,
 *   that shows up as `unapplied` rather than silently skewing the aging.
 *
 *   Every figure here is whole cents: charges come from lib/interest.ts
 *   already rounded, and each total below is rounded again so adding many
 *   amounts can never leave a fraction of a cent behind.
 *
 *   Unpaid balances do NOT themselves accrue interest -- they carry forward
 *   at face value. This matches interest-only hard-money servicing.
 *
 *   INTEREST RESERVE
 *   A loan can collect N months of interest at closing. The total collected
 *   (interest_reserve_total) is split evenly over the N months straight after
 *   the closing month, any leftover cent going to the last month so the months
 *   always add back up to exactly what was collected ($4,000 over 3 months is
 *   1,333.33 + 1,333.33 + 1,333.34). Each month the reserve covers its share,
 *   never more than that month's interest. The borrower is billed only what is
 *   left: for a reserve month,
 *       billed(P) = charge(P) - reserve(P)
 *   Every balance, past-due and payment figure works off billed(P), so a
 *   reserve is never entered as a payment and never shows as a credit. A loan
 *   with no reserve has reserve(P) = 0 everywhere, so nothing changes for it.
 *
 *   DEFAULT INTEREST
 *   Interest is due on the 1st. If any of it is still unpaid after the 15th of
 *   that month (month M), the borrower is in default for M and is charged
 *   default interest equal to the late amount -- so the late amount is in
 *   effect owed twice. It shows from the 16th, but it is only provisional
 *   until M ends: if the late interest is paid in full by the last day of M
 *   it falls back off, and if only part is paid, default is charged only on
 *   what is still unpaid at month end.
 *       default(M) = interest billed for periods due on or before the 1st of M
 *                    - what payments dated by the end of M paid toward it
 *                    - payments received by the end of M not yet applied
 *   Only interest counts: an unpaid default charge does not itself attract
 *   more default. default(M) is billed together with M's own interest, on the
 *   statement dated the 1st of M+1, and a payment applied to M pays M's
 *   interest first and then its default.
 */

export interface PaymentRow {
  id: string;
  payment_date: string;         // YYYY-MM-DD
  amount: number;
  method?: string | null;
  note?: string | null;
}

export interface AllocationRow {
  payment_id: string;
  period_month: string;         // YYYY-MM-01 of the CHARGE period
  amount: number;
}

export interface PeriodCharge {
  periodMonth: string;          // YYYY-MM-01 of the period the interest covers
  label: string;                // "July 2026" -- the period covered
  statementDate: string;        // YYYY-MM-01 -- the statement this charge bills on
  statementLabel: string;       // "August 2026" -- that statement's month
  charge: number;               // interest for the period, before any reserve
  reserve: number;              // covered by the interest reserve
  defaultInterest: number;      // default interest for being late during this month
  billed: number;               // charge - reserve + defaultInterest: what the borrower owes for it
  paid: number;
  balance: number;
  inProgress: boolean;          // period hasn't ended yet, so the figure can still move
}

export interface Ledger {
  periodMonth: string;
  periodLabel: string;
  /** What this statement bills: interest less any interest reserve. */
  currentCharge: number;
  /** Interest for the period(s) billed, before the reserve. */
  currentInterest: number;
  /** The part of currentInterest the interest reserve covers. */
  currentReserve: number;
  /** Default interest billed on this statement (see DEFAULT INTEREST above). */
  currentDefault: number;
  previousBalance: number;
  paymentsThisPeriod: number;
  /** previousBalance - paymentsThisPeriod: what was still open before this
   *  statement's own charges. Shown so the arithmetic reads straight down
   *  rather than making the borrower do the subtraction. */
  previousOpenBalance: number;
  amountDue: number;
  priorUnpaid: PeriodCharge[];
  /** The period(s) this statement bills. More than one on the first billed
   *  statement, which carries the deferred closing month as well. */
  currentPeriods: PeriodCharge[];
  /** True on a statement that bills nothing because the closing month's
   *  interest has been deferred to the next one. */
  deferredToNext: boolean;
  paymentsInPeriod: PaymentRow[];
  unapplied: number;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** First day of the period a given statement date covers (the month before). */
export function periodMonthFor(statementDate: string): string {
  return firstOfMonth(statementDate, -1);
}

/** Last day of a period month. */
export function periodEndOf(periodMonth: string): string {
  const [y, m] = periodMonth.slice(0, 10).split('-').map(Number);
  return iso(new Date(y, m, 0));
}

/** Every charge period from the closing month through `periodMonth`, oldest first. */
export function periodsThrough(
  closingDate: string, periodMonth: string, paidOffDate?: string | null,
): string[] {
  // A paid-off loan stops accruing. The last billable period is the month
  // BEFORE the payoff month: interest from the 1st up to the payoff date is a
  // stub that belongs on the payoff statement, and billing a whole month here
  // would charge for days after the loan was settled.
  let end = periodMonth;
  if (paidOffDate) {
    const lastBillable = firstOfMonth(paidOffDate, -1);
    if (lastBillable < end) end = lastBillable;
  }

  const out: string[] = [];
  let cur = firstOfMonth(closingDate);
  for (let i = 0; i < 600 && cur <= end; i++) {
    out.push(cur);
    cur = firstOfMonth(cur, 1);
  }
  return out;
}

/** The loan fields the ledger needs beyond the interest engine's. */
export interface LedgerLoan extends Loan {
  paid_off_date?: string | null;
  interest_reserve_months?: number | string | null;
  interest_reserve_total?: number | string | null;
}

/** The reserve fields of a loan row, as numbers, for building a LedgerLoan. */
export function reserveFields(row: object | null | undefined) {
  const r = (row ?? {}) as { interest_reserve_months?: unknown; interest_reserve_total?: unknown };
  return {
    interest_reserve_months: Number(r.interest_reserve_months) || 0,
    interest_reserve_total: Number(r.interest_reserve_total) || 0,
  };
}

/** The periods an interest reserve covers: the N months after the closing month. */
export function reservePeriods(loan: LedgerLoan): string[] {
  const months = Math.max(0, Math.floor(Number(loan.interest_reserve_months) || 0));
  const total = Number(loan.interest_reserve_total) || 0;
  if (!months || !(total > 0)) return [];
  return Array.from({ length: months }, (_, i) => firstOfMonth(loan.closing_date, i + 1));
}

/** Each reserve month's share of the total collected, oldest first. Adds up to the total exactly. */
export function reserveShares(totalCollected: number, months: number): number[] {
  const n = Math.max(0, Math.floor(months));
  if (!n) return [];
  const total = cents(totalCollected);
  const each = cents(total / n);
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? each : cents(total - each * (n - 1))));
}

/** The reserve set aside for a period, before comparing it with that period's interest. */
export function reserveShareForPeriod(loan: LedgerLoan, periodMonth: string): number {
  const periods = reservePeriods(loan);
  const i = periods.indexOf(firstOfMonth(periodMonth));
  if (i < 0) return 0;
  return reserveShares(Number(loan.interest_reserve_total) || 0, periods.length)[i];
}

/** The part of a period's interest the interest reserve covers (never more than the interest). */
export function reserveForPeriod(loan: LedgerLoan, draws: Draw[], periodMonth: string): number {
  const share = reserveShareForPeriod(loan, periodMonth);
  if (!share) return 0;
  return cents(Math.min(share, chargeForPeriod(loan, draws, firstOfMonth(periodMonth))));
}

/** The interest the borrower is billed for a period: its interest less any reserve. No default interest. */
export function billedForPeriod(loan: LedgerLoan, draws: Draw[], periodMonth: string): number {
  return cents(chargeForPeriod(loan, draws, periodMonth) - reserveForPeriod(loan, draws, periodMonth));
}

/** Day of the month through which interest due on the 1st can still be paid without default. */
export const DEFAULT_GRACE_DAY = 15;

/**
 * Default interest for month `periodMonth` (see DEFAULT INTEREST above).
 * Nothing shows through the 15th of that month as of `asOf`; after that it is
 * the late interest still unpaid, counting payments dated through the month's
 * last day.
 */
export function defaultForPeriod(
  loan: LedgerLoan,
  draws: Draw[],
  payments: PaymentRow[],
  allocations: AllocationRow[],
  periodMonth: string,
  asOf: Date | string = todayInAppTz(),
): number {
  const m = firstOfMonth(periodMonth);
  const today = typeof asOf === 'string' ? asOf.slice(0, 10) : iso(asOf);
  if (today <= `${m.slice(0, 8)}${String(DEFAULT_GRACE_DAY).padStart(2, '0')}`) return 0;
  if (loan.paid_off_date && m >= firstOfMonth(loan.paid_off_date)) return 0;

  const end = periodEndOf(m);
  const payDate = new Map(payments.map(p => [p.id, p.payment_date.slice(0, 10)]));
  const counted = allocations.filter(a => {
    const d = payDate.get(a.payment_id);
    return d !== undefined && d <= end;
  });
  const paidByPeriod = new Map<string, number>();
  for (const a of counted) {
    const key = firstOfMonth(a.period_month);
    paidByPeriod.set(key, cents((paidByPeriod.get(key) ?? 0) + Number(a.amount)));
  }

  // Interest that fell due on or before the 1st of this month. A payment
  // applied to a period pays its interest before its own default.
  const late = periodsThrough(loan.closing_date, firstOfMonth(m, -1), loan.paid_off_date)
    .filter(p => dueDateFor(p, loan.closing_date) <= m);
  const unpaid = late.reduce(
    (s, p) => cents(s + Math.max(0, billedForPeriod(loan, draws, p) - (paidByPeriod.get(p) ?? 0))), 0);
  if (unpaid <= 0.005) return 0;

  // Money received by month end but not yet applied to a month still counts.
  const received = payments
    .filter(p => p.payment_date.slice(0, 10) <= end)
    .reduce((s, p) => cents(s + Number(p.amount)), 0);
  const applied = counted.reduce((s, a) => cents(s + Number(a.amount)), 0);
  const unapplied = Math.max(0, cents(received - applied));

  return Math.max(0, cents(unpaid - unapplied));
}

/** One period's row, with what the reserve and the borrower's payments cover. */
function periodRow(
  loan: LedgerLoan, draws: Draw[], p: string, paid: number, inProgress = false, defaultInterest = 0,
): PeriodCharge {
  const charge = chargeForPeriod(loan, draws, p);
  const reserve = reserveForPeriod(loan, draws, p);
  const billed = cents(charge - reserve + defaultInterest);
  const due = dueDateFor(p, loan.closing_date);
  return {
    periodMonth: p, label: monthName(p),
    statementDate: due, statementLabel: monthName(due),
    charge, reserve, defaultInterest, billed, paid, balance: cents(billed - paid), inProgress,
  };
}

/** Statement dates that make sense for a loan: none past its payoff. */
export function lastStatementDate(paidOffDate?: string | null): string | null {
  return paidOffDate ? firstOfMonth(paidOffDate) : null;
}

/** Interest charged for one period. */
export function chargeForPeriod(loan: Loan, draws: Draw[], periodMonth: string): number {
  return cents(buildStatement(loan, draws, firstOfMonth(periodMonth, 1)).amountDue);
}

/**
 * Build the full ledger for the statement dated `statementDate`.
 * Everything is as of that statement's period end -- later payments and
 * later charges do not appear, exactly like draws.
 */
export function buildLedger(
  loan: LedgerLoan,
  draws: Draw[],
  payments: PaymentRow[],
  allocations: AllocationRow[],
  statementDate: string,
): Ledger {
  const periodMonth = periodMonthFor(statementDate);
  const periodStart = periodMonth;
  const periodEnd = periodEndOf(periodMonth);

  // A statement bills every period whose due date IS this statement's date.
  // Normally that is just the month it covers, but the first billed statement
  // also carries the deferred closing month.
  const statementMonth = firstOfMonth(statementDate);
  const allPeriods = periodsThrough(loan.closing_date, periodMonth, (loan as LedgerLoan).paid_off_date);
  const currentPeriodMonths = allPeriods.filter(p => dueDateFor(p, loan.closing_date) === statementMonth);
  const priorPeriods = allPeriods.filter(p => dueDateFor(p, loan.closing_date) < statementMonth);

  const currentInterest = currentPeriodMonths
    .reduce((sum, p) => cents(sum + chargeForPeriod(loan, draws, p)), 0);
  const currentReserve = currentPeriodMonths
    .reduce((sum, p) => cents(sum + reserveForPeriod(loan, draws, p)), 0);
  const asOfToday = todayInAppTz();
  const dflt = (p: string) => defaultForPeriod(loan, draws, payments, allocations, p, asOfToday);
  const currentDefault = currentPeriodMonths.reduce((sum, p) => cents(sum + dflt(p)), 0);
  const currentCharge = cents(currentInterest - currentReserve + currentDefault);

  // ---- date-based running balance
  const paidBefore = payments
    .filter(p => p.payment_date < periodStart)
    .reduce((s, p) => cents(s + Number(p.amount)), 0);

  const priorCharges = priorPeriods
    .reduce((s, p) => cents(s + billedForPeriod(loan, draws, p) + dflt(p)), 0);
  const previousBalance = cents(priorCharges - paidBefore);

  const paymentsInPeriod = payments
    .filter(p => p.payment_date >= periodStart && p.payment_date <= periodEnd)
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date));
  const paymentsThisPeriod = paymentsInPeriod.reduce((s, p) => cents(s + Number(p.amount)), 0);

  const previousOpenBalance = cents(previousBalance - paymentsThisPeriod);
  const amountDue = cents(previousOpenBalance + currentCharge);

  // ---- allocation-based aging of earlier months
  const payById = new Map(payments.map(p => [p.id, p]));
  const asOfAllocations = allocations.filter(a => {
    const pay = payById.get(a.payment_id);
    return pay ? pay.payment_date <= periodEnd : false;
  });

  const paidByPeriod = new Map<string, number>();
  for (const a of asOfAllocations) {
    const key = firstOfMonth(a.period_month);
    paidByPeriod.set(key, cents((paidByPeriod.get(key) ?? 0) + Number(a.amount)));
  }

  const currentPeriods: PeriodCharge[] = currentPeriodMonths
    .map(p => periodRow(loan, draws, p, paidByPeriod.get(p) ?? 0, false, dflt(p)));

  const priorUnpaid: PeriodCharge[] = priorPeriods
    .map(p => periodRow(loan, draws, p, paidByPeriod.get(p) ?? 0, false, dflt(p)))
    .filter(r => r.balance > 0.005);

  // Payments received but not applied to any month yet.
  const paidToDate = payments
    .filter(p => p.payment_date <= periodEnd)
    .reduce((s, p) => cents(s + Number(p.amount)), 0);
  const allocatedToDate = asOfAllocations.reduce((s, a) => cents(s + Number(a.amount)), 0);
  const unapplied = Math.max(0, cents(paidToDate - allocatedToDate));

  return {
    periodMonth,
    periodLabel: monthName(periodMonth),
    currentCharge,
    currentInterest,
    currentReserve,
    currentDefault,
    currentPeriods,
    deferredToNext: currentPeriodMonths.length === 0,
    previousBalance,
    paymentsThisPeriod,
    previousOpenBalance,
    amountDue,
    priorUnpaid,
    paymentsInPeriod,
    unapplied,
  };
}

/**
 * When a period's interest falls due: the first of the month AFTER the period,
 * which is also the date of the statement that bills it. August's interest is
 * billed on the 1 September statement and is late from that day.
 */
export function dueDateFor(periodMonth: string, closingDate: string): string {
  // The closing month is not billed on the very next statement. A borrower who
  // closes 6/15 and draws 6/25 gets a full month before anything is owed, so
  // that stub interest is first due 8/1 -- billed alongside July's full month.
  const closingMonth = firstOfMonth(closingDate);
  return firstOfMonth(periodMonth, periodMonth === closingMonth ? 2 : 1);
}

/**
 * Everything genuinely overdue as of a date -- every period whose due date has
 * passed and still carries a balance.
 *
 * This is NOT the same as a statement's "unpaid previous charges". That list
 * is relative to the statement being read: on the 1 September statement,
 * August's interest is the current charge. But the moment 1 September arrives
 * unpaid, August is late. Anything reporting on the book as of today -- the
 * insights past-due table, the alert on a loan -- has to use this, or a month
 * stays invisible until the next statement is issued.
 */
export function pastDueAsOf(
  loan: LedgerLoan,
  draws: Draw[],
  payments: PaymentRow[],
  allocations: AllocationRow[],
  asOf: Date | string = new Date(),
): PeriodCharge[] {
  const today = typeof asOf === 'string' ? asOf : iso(asOf);

  const paidByPeriod = new Map<string, number>();
  for (const a of allocations) {
    const key = firstOfMonth(a.period_month);
    paidByPeriod.set(key, cents((paidByPeriod.get(key) ?? 0) + Number(a.amount)));
  }

  // Periods whose due date is on or before today.
  const thisMonth = firstOfMonth(today);
  const rows = periodsThrough(loan.closing_date, firstOfMonth(today, -1), (loan as LedgerLoan).paid_off_date)
    .filter(p => dueDateFor(p, loan.closing_date) <= thisMonth)
    .map(p => periodRow(loan, draws, p, paidByPeriod.get(p) ?? 0, false,
      defaultForPeriod(loan, draws, payments, allocations, p, today)));

  // From the 16th, this month's default interest is owed straight away, even
  // though the rest of this month's charge is not due until next month. It
  // stands as its own row; a payment applied to this month pays its interest
  // first, so only what is applied beyond that counts against the default.
  const inPeriods = periodsThrough(loan.closing_date, thisMonth, (loan as LedgerLoan).paid_off_date).includes(thisMonth);
  const nowDefault = inPeriods ? defaultForPeriod(loan, draws, payments, allocations, thisMonth, today) : 0;
  if (nowDefault > 0.005) {
    const interest = billedForPeriod(loan, draws, thisMonth);
    const paid = Math.min(nowDefault, Math.max(0, cents((paidByPeriod.get(thisMonth) ?? 0) - interest)));
    const due = dueDateFor(thisMonth, loan.closing_date);
    rows.push({
      periodMonth: thisMonth, label: `${monthName(thisMonth)} default interest`,
      statementDate: due, statementLabel: monthName(due),
      charge: 0, reserve: 0, defaultInterest: nowDefault, billed: nowDefault,
      paid, balance: cents(nowDefault - paid), inProgress: true,
    });
  }
  return rows.filter(r => r.billed > 0.005 && r.balance > 0.005);
}

/**
 * Outstanding balance per period, for the "apply this payment to" picker.
 * Oldest first, settled months dropped.
 *
 * `throughPeriodMonth` defaults to the period now in progress, so from the 1st
 * of a month that month's own charge is already on the list and a payment can
 * be applied to it. An in-progress period is flagged, because a later draw can
 * still move its figure.
 */
export function openCharges(
  loan: LedgerLoan,
  draws: Draw[],
  payments: PaymentRow[],
  allocations: AllocationRow[],
  throughPeriodMonth: string = firstOfMonth(todayInAppTz()),
): PeriodCharge[] {
  const currentPeriod = firstOfMonth(todayInAppTz());
  const paidByPeriod = new Map<string, number>();
  for (const a of allocations) {
    const key = firstOfMonth(a.period_month);
    paidByPeriod.set(key, cents((paidByPeriod.get(key) ?? 0) + Number(a.amount)));
  }
  return periodsThrough(loan.closing_date, throughPeriodMonth, (loan as LedgerLoan).paid_off_date)
    .map(p => periodRow(loan, draws, p, paidByPeriod.get(p) ?? 0, p >= currentPeriod,
      defaultForPeriod(loan, draws, payments, allocations, p)))
    .filter(r => r.billed > 0.005 && r.balance > 0.005);
}
