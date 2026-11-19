import { pastDueAsOf, buildLedger, reserveFields } from '@/lib/ledger';
import { todayInAppTz, clampMonth, defaultStatementMonth } from '@/lib/format';

/**
 * Which loans are past due today, and by how much.
 *
 * A read-only wrapper over the ledger's own pastDueAsOf -- the same call the
 * Insights page and the loan page use -- so every screen agrees on what is
 * late. It never changes how anything is calculated.
 */
export interface PastDue { amount: number; months: number; oldest: string }

function inputsFor(l: any, draws: any[], payments: any[], allocations: any[]) {
  return {
    loan: {
      loan_amount: Number(l.loan_amount), acquisition: Number(l.acquisition),
      annual_rate: Number(l.annual_rate), closing_date: l.closing_date,
      paid_off_date: l.paid_off_date ?? null,
      ...reserveFields(l),
    },
    d: draws.filter((x: any) => x.loan_id === l.loan_id)
      .map((x: any) => ({ draw_date: x.draw_date, amount: Number(x.amount), description: x.description })),
    p: payments.filter((x: any) => x.loan_id === l.loan_id)
      .map((x: any) => ({ id: x.id, payment_date: x.payment_date, amount: Number(x.amount), method: x.method, note: x.note })),
    a: allocations.filter((x: any) => x.loan_id === l.loan_id)
      .map((x: any) => ({ payment_id: x.payment_id, period_month: x.period_month, amount: Number(x.amount) })),
  };
}

/**
 * What each loan still owes on its current statement (the statement's amount
 * due less payments received since) and the statement date it falls due on.
 * Uses the same statement month the borrower's portal opens on: this month's
 * through the 15th, next month's from the 16th.
 */
export interface DueNow { amount: number; date: string; deferred: boolean }

export function dueNowByLoan(
  loans: any[], draws: any[], payments: any[], allocations: any[],
): Map<string, DueNow> {
  const out = new Map<string, DueNow>();
  for (const l of loans) {
    if (l.status === 'paid_off') continue;
    const x = inputsFor(l, draws, payments, allocations);
    const asOf = clampMonth(defaultStatementMonth(), l.closing_date);
    const led = buildLedger(x.loan, x.d, x.p, x.a, asOf);
    // The statement itself is a snapshot as of the 1st, so a payment made
    // after that never lowers its "Amount due". This list is about today, so
    // show what is STILL owed on the months that statement bills: each
    // month's charge less everything applied to it so far, less any payment
    // received but not yet applied to a month. A paid statement shows $0.00.
    const open = pastDueAsOf(x.loan, x.d, x.p, x.a, asOf)
      .reduce((s, r) => s + r.balance, 0);
    const received = x.p.reduce((s, p) => s + p.amount, 0);
    const applied = x.a.reduce((s, a) => s + a.amount, 0);
    const unapplied = Math.max(0, received - applied);
    const stillOwed = Math.round(Math.max(0, open - unapplied) * 100) / 100;
    out.set(l.loan_id, { amount: stillOwed, date: asOf, deferred: !!led.deferredToNext });
  }
  return out;
}

export function pastDueByLoan(
  loans: any[], draws: any[], payments: any[], allocations: any[],
): Map<string, PastDue> {
  const today = todayInAppTz();
  const out = new Map<string, PastDue>();
  for (const l of loans) {
    // A paid-off loan is settled: it neither owes nor can be late.
    if (l.status === 'paid_off') continue;
    const x = inputsFor(l, draws, payments, allocations);
    const late = pastDueAsOf(x.loan, x.d, x.p, x.a, today);
    if (late.length) {
      out.set(l.loan_id, {
        amount: late.reduce((s, r) => s + r.balance, 0),
        months: late.length,
        oldest: late[0].statementDate,
      });
    }
  }
  return out;
}
