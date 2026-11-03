'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MarkPaidOffModal, { signedMoney } from '@/components/MarkPaidOffModal';
import { longDate, type LenderPayoffFigures, type PayoffQuote } from '@/lib/payoff';
import { money, pct, fmtDate, fmtDateTime, borrowerDisplayName } from '@/lib/format';
import type { Draw } from '@/lib/interest';
import type { PaymentRow, AllocationRow } from '@/lib/ledger';
import Logo from '@/components/Logo';
import { BRAND } from '@/lib/brand-assets';

interface Recorded {
  payoff_date: string;
  amount_received: number | string;
  late_fee: number | string;
  discharge_fee: number | string;
  figures: LenderPayoffFigures;   // locked when the payoff was saved
  updated_at: string;
}

export default function LenderPayoffStatement({ loan, payoff, canEdit, draws, payments, allocations, quote }: {
  loan: any; payoff: Recorded | null; canEdit: boolean;
  draws: Draw[]; payments: PaymentRow[]; allocations: AllocationRow[]; quote: PayoffQuote | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  if (!payoff) {
    return (
      <div className="wrap" style={{ maxWidth: 960 }}>
        <p style={{ marginBottom: 12 }}><Link href={`/admin/loans/${loan.loan_id}`}>&larr; Back to loan</Link></p>
        <div className="card"><div className="alert info" style={{ margin: 0 }}>
          This loan has not been marked paid off with a payoff amount, so there is no Lender Payoff Statement.
        </div></div>
      </div>
    );
  }
  const fig = payoff.figures;

  return (
    <div className="wrap" style={{ maxWidth: 960 }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Link href={`/admin/loans/${loan.loan_id}`}>&larr; Back to loan</Link>
        <span className="muted" style={{ fontSize: 13 }}>Internal: staff and admins only, never shown to the borrower</span>
      </div>

      <div className="no-print doc-tabs">
        <h2 style={{ color: 'var(--navy)', margin: 0 }}>Lender Payoff Statement</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && <button className="btn secondary" onClick={() => setEditing(true)}>Edit</button>}
          <a className="btn" style={{ textDecoration: 'none' }} href={`/api/lender-payoff-pdf/${loan.loan_id}`} target="_blank" rel="noopener">Download PDF</a>
        </div>
      </div>

      {/* Ours only: never on the statement or its PDF. */}
      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div className="payoff-check" style={{ margin: 0 }}>
          <div className="row"><span>Received on {fmtDate(fig.payoffDate)}</span><b>{money(fig.received)}</b></div>
          {fig.expected !== null ? (
            <>
              <div className="row">
                <span>
                  Expected per the payoff letter
                  {fig.extraDays > 0 && <span className="muted hint" style={{ display: 'block' }}>
                    Letter total + {fig.extraDays} day{fig.extraDays === 1 ? '' : 's'} per diem after {fmtDate(fig.quoteThrough!)}
                  </span>}
                </span>
                <b>{money(fig.expected)}</b>
              </div>
              <div className={`row diff ${fig.difference! < -0.005 ? 'short' : 'ok'}`}><span>Difference</span><b>{signedMoney(fig.difference!)}</b></div>
            </>
          ) : (
            <div className="muted hint">There was no payoff letter on this loan to compare with.</div>
          )}
        </div>
      </div>

      <div className="card doc">
        <div className="doc-head">
          <Logo variant="stacked" size={30} />
          <div className="doc-rule" />
          <div className="doc-title">LENDER PAYOFF STATEMENT</div>
        </div>

        <div className="contact">
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Property Address:</div>
            <div className="name">{loan.property}</div>
            <div><b style={{ color: 'var(--navy)' }}>Borrower:</b> {borrowerDisplayName(loan)}</div>
            <div><b style={{ color: 'var(--navy)' }}>Lender:</b> {loan.lender_name ?? ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted">Payoff Date</div>
            <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{longDate(fig.payoffDate)}</div>
            <div className="muted" style={{ marginTop: 6 }}>Loan {loan.loan_number}</div>
          </div>
        </div>

        <p className="pay-auth">
          Payoff funds were received on {longDate(fig.payoffDate)}. Below is the breakdown of the amounts due to the Lender.
        </p>

        <div className="doc-table">
          <div className="doc-th"><span>Description</span><span>Amount</span></div>
          {fig.lines.map((l, i) => (
            <div className="doc-tr" key={i}>
              <span>{l.label}</span>
              <span className="num">{l.amount < 0 ? `(${money(-l.amount)})` : money(l.amount)}</span>
            </div>
          ))}
          <div className="doc-total"><span>TOTAL DUE TO LENDER</span><span>{money(fig.total)}</span></div>
        </div>

        <div className="pay-panel" style={{ marginTop: 26 }}>
          <div className="panel-bar">Loan Details</div>
          <div className="summary" style={{ margin: 0, padding: '0 14px' }}>
            <div className="col">
              <div className="row"><span className="k">Loan Amount</span><span className="v">{money(loan.loan_amount)}</span></div>
              <div className="row"><span className="k">Interest Rate</span><span className="v">{pct(loan.annual_rate)}</span></div>
              <div className="row"><span className="k">Closing Date</span><span className="v">{fmtDate(loan.closing_date)}</span></div>
            </div>
            <div className="col">
              <div className="row"><span className="k">Interest Paid Through</span><span className="v">{fig.paidThrough < loan.closing_date ? 'Closing' : fmtDate(fig.paidThrough)}</span></div>
              <div className="row"><span className="k">Payoff Date</span><span className="v">{fmtDate(fig.payoffDate)}</span></div>
              <div className="row"><span className="k">Servicer</span><span className="v">{BRAND.legal}</span></div>
            </div>
          </div>
        </div>

        <div className="doc-foot">
          <div>{BRAND.legal} &middot; {BRAND.address}</div>
          <div>{BRAND.phone} &middot; {BRAND.email}</div>
          <div style={{ marginTop: 4 }}>Last updated {fmtDateTime(payoff.updated_at)}</div>
        </div>
      </div>

      {canEdit && (
        <MarkPaidOffModal
          open={editing} editing
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); router.refresh(); }}
          loan={loan} draws={draws} payments={payments} allocations={allocations} quote={quote}
          defaults={{
            payoffDate: payoff.payoff_date, amountReceived: payoff.amount_received,
            lateFee: payoff.late_fee, dischargeFee: payoff.discharge_fee,
          }}
        />
      )}
    </div>
  );
}
