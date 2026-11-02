import { pastDueAsOf } from '@/lib/ledger';
import { todayInAppTz } from '@/lib/format';

/**
 * Which loans are past due today, and by how much.
 *
 * A read-only wrapper over the ledger's own pastDueAsOf -- the same call the
 * Insights page and the loan page use -- so every screen agrees on what is
 * late. It never changes how anything is calculated.
 */
export interface PastDue { amount: number; months: number; oldest: string }

export function pastDueByLoan(
  loans: any[], draws: any[], payments: any[], allocations: any[],
): Map<string, PastDue> {
  const today = todayInAppTz();
  const out = new Map<string, PastDue>();
  for (const l of loans) {
    // A paid-off loan is settled: it neither owes nor can be late.
    if (l.status === 'paid_off') continue;
    const engineLoan = {
      loan_amount: Number(l.loan_amount), acquisition: Number(l.acquisition),
      annual_rate: Number(l.annual_rate), closing_date: l.closing_date,
      paid_off_date: l.paid_off_date ?? null,
    };
    const d = draws.filter((x: any) => x.loan_id === l.loan_id)
      .map((x: any) => ({ draw_date: x.draw_date, amount: Number(x.amount), description: x.description }));
    const p = payments.filter((x: any) => x.loan_id === l.loan_id)
      .map((x: any) => ({ id: x.id, payment_date: x.payment_date, amount: Number(x.amount), method: x.method, note: x.note }));
    const a = allocations.filter((x: any) => x.loan_id === l.loan_id)
      .map((x: any) => ({ payment_id: x.payment_id, period_month: x.period_month, amount: Number(x.amount) }));
    const late = pastDueAsOf(engineLoan, d, p, a, today);
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
