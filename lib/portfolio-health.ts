import { pastDueAsOf, buildLedger } from '@/lib/ledger';
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
 * What each loan's current statement asks for: the amount due and the
 * statement date it falls due on. Uses the same statement month the borrower's
 * portal opens on, so staff and borrower see the same figure.
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
    out.set(l.loan_id, { amount: Math.max(0, led.amountDue), date: asOf, deferred: !!led.deferredToNext });
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
