'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { markLoanPaidOff } from '@/lib/actions';
import { lenderPayoffFigures, STANDARD_DISCHARGE_FEE, type PayoffQuote } from '@/lib/payoff';
import { money, fmtDate } from '@/lib/format';
import type { Draw } from '@/lib/interest';
import type { PaymentRow, AllocationRow } from '@/lib/ledger';

export interface PaidOffDefaults {
  payoffDate?: string | null;
  amountReceived?: number | string | null;
  lateFee?: number | string | null;
  dischargeFee?: number | string | null;
}

/** +$323.17, −$50.00, or $0.00. */
export function signedMoney(n: number): string {
  return (n > 0.005 ? '+' : n < -0.005 ? '−' : '') + money(Math.abs(n));
}

/**
 * Mark a loan paid off, or correct a recorded payoff. Asks for the payoff
 * date, the amount received and the lender's late and discharge fees, and
 * shows as you type what the lender is owed and how the amount received
 * compares with what the payoff letter said was owed that day.
 */
export default function MarkPaidOffModal({
  open, onClose, onSaved, loan, draws, payments, allocations, quote, defaults, editing = false,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  loan: { loan_id: string; loan_amount: number | string; acquisition: number | string; annual_rate: number | string; closing_date: string };
  draws: Draw[]; payments: PaymentRow[]; allocations: AllocationRow[];
  quote: PayoffQuote | null;
  defaults: PaidOffDefaults;
  editing?: boolean;
}) {
  const fresh = () => ({
    date: defaults.payoffDate ?? '',
    received: defaults.amountReceived ? String(Number(defaults.amountReceived)) : '',
    late: Number(defaults.lateFee) ? String(Number(defaults.lateFee)) : '',
    discharge: String(defaults.dischargeFee ?? STANDARD_DISCHARGE_FEE),
  });
  const [form, setForm] = useState(fresh);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Start from the saved values each time it opens.
  useEffect(() => { if (open) { setForm(fresh()); setError(''); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const fig = form.date
    ? lenderPayoffFigures(loan, draws, payments, allocations, {
        payoff_date: form.date, amount_received: form.received, late_fee: form.late, discharge_fee: form.discharge,
      }, quote)
    : null;

  async function save() {
    if (!form.date) { setError('Please enter the payoff date.'); return; }
    if (!(Number(form.received) > 0)) { setError('Please enter the payoff amount received.'); return; }
    setBusy(true); setError('');
    const res = await markLoanPaidOff(loan.loan_id, {
      payoffDate: form.date,
      amountReceived: Number(form.received),
      lateFee: Number(form.late) || 0,
      dischargeFee: Number(form.discharge) || 0,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not mark the loan paid off.'); return; }
    onSaved();
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={editing ? 'Edit Payoff' : 'Mark Loan Paid Off'} maxWidth={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!editing && (
          <p className="muted" style={{ margin: 0 }}>
            Interest stops at the payoff date and no further statements are issued.
            This also creates the Lender Payoff Statement.
          </p>
        )}
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <div className="field-wrap">
            <label>Payoff date</label>
            <input className="field" type="date" value={form.date} min={loan.closing_date}
              onChange={e => set('date', e.target.value)} />
          </div>
          <div className="field-wrap">
            <label>Payoff amount received ($)</label>
            <input className="field" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
              value={form.received} onChange={e => set('received', e.target.value)} />
          </div>
          <div className="field-wrap">
            <label>Late fee ($)</label>
            <input className="field" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
              value={form.late} onChange={e => set('late', e.target.value)} />
          </div>
          <div className="field-wrap">
            <label>Discharge fee ($)</label>
            <input className="field" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
              value={form.discharge} onChange={e => set('discharge', e.target.value)} />
          </div>
        </div>
        <span className="muted hint" style={{ marginTop: -6 }}>
          The late and discharge fees are for the Lender Payoff Statement.
        </span>

        {fig && (
          <div className="payoff-check">
            <div className="row"><span>Due to lender</span><b>{money(fig.total)}</b></div>
            {fig.expected !== null ? (
              <>
                <div className="row">
                  <span>
                    Expected on {fmtDate(fig.payoffDate)}
                    <span className="muted hint" style={{ display: 'block' }}>
                      Payoff letter{fig.extraDays > 0 ? ` + ${fig.extraDays} day${fig.extraDays === 1 ? '' : 's'} per diem after ${fmtDate(fig.quoteThrough!)}` : ''}
                    </span>
                  </span>
                  <b>{money(fig.expected)}</b>
                </div>
                <div className="row"><span>Received</span><b>{money(fig.received)}</b></div>
                <div className={`row diff ${fig.difference! < -0.005 ? 'short' : 'ok'}`}>
                  <span>Difference</span>
                  <b>{signedMoney(fig.difference!)}</b>
                </div>
              </>
            ) : (
              <div className="muted hint">No payoff letter on this loan, so there is nothing to compare the amount received with.</div>
            )}
          </div>
        )}

        {error && <div className="alert error" style={{ margin: 0 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Mark paid off'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
