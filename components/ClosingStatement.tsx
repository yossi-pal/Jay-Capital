'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saveClosingStatement } from '@/lib/actions';
import { closingFigures, lenderLines, closingCostLines, type OtherFee, type ClosingFigures } from '@/lib/closing-statement';
import { money, pct, fmtDate, fmtDateTime, borrowerDisplayName, lienPositionLabel } from '@/lib/format';
import Logo from '@/components/Logo';
import { BRAND } from '@/lib/brand-assets';

interface Stored {
  lender_points_pct: number | string;
  interest_reserve_months: number | null;
  broker_fee_pct: number | string;
  processing_fee: number | string;
  legal_fee: number | string;
  other_fees: OtherFee[] | null;
  notes: string | null;
  lender_notes: string | null;
  updated_at: string;
}

type View = 'closing' | 'lender';

/** The form's values, kept as typed text so a half-typed number isn't lost. */
function formFrom(s: Stored | null) {
  const n = (v: number | string | null | undefined) => (s ? String(Number(v ?? 0)) : '');
  return {
    points: n(s?.lender_points_pct),
    months: n(s?.interest_reserve_months),
    broker: n(s?.broker_fee_pct),
    processing: n(s?.processing_fee),
    legal: n(s?.legal_fee),
    other: (s?.other_fees ?? []).map(f => ({ label: f.label, amount: String(f.amount) })),
    notes: s?.notes ?? '',
    lenderNotes: s?.lender_notes ?? '',
  };
}

export default function ClosingStatement({ loan, statement, canEdit, initialView }: {
  loan: any; statement: Stored | null; canEdit: boolean; initialView: View;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [editing, setEditing] = useState(!statement && canEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => formFrom(statement));
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  // On screen the figures follow what is typed; once saved they come from the stored row.
  const source = editing
    ? {
        lender_points_pct: form.points, interest_reserve_months: form.months,
        broker_fee_pct: form.broker, processing_fee: form.processing, legal_fee: form.legal,
        other_fees: form.other.map(o => ({ label: o.label, amount: Number(o.amount) || 0 })),
      }
    : {
        lender_points_pct: statement?.lender_points_pct ?? 0, interest_reserve_months: statement?.interest_reserve_months ?? 0,
        broker_fee_pct: statement?.broker_fee_pct ?? 0, processing_fee: statement?.processing_fee ?? 0,
        legal_fee: statement?.legal_fee ?? 0, other_fees: statement?.other_fees ?? [],
      };
  const fig = closingFigures({
    loan_amount: loan.loan_amount, acquisition: loan.acquisition, construction: loan.construction,
    annual_rate: loan.annual_rate, closing_date: loan.closing_date, ...source,
  });
  const notes = view === 'lender'
    ? (editing ? form.lenderNotes : statement?.lender_notes ?? '')
    : (editing ? form.notes : statement?.notes ?? '');

  function cancel() {
    setForm(formFrom(statement));
    setError('');
    if (statement) setEditing(false); else router.push(`/admin/loans/${loan.loan_id}`);
  }

  async function save() {
    setBusy(true); setError('');
    const res = await saveClosingStatement(loan.loan_id, {
      lenderPointsPct: Number(form.points) || 0,
      interestReserveMonths: Number(form.months) || 0,
      brokerFeePct: Number(form.broker) || 0,
      processingFee: Number(form.processing) || 0,
      legalFee: Number(form.legal) || 0,
      otherFees: form.other.map(o => ({ label: o.label, amount: Number(o.amount) || 0 })),
      notes: form.notes,
      lenderNotes: form.lenderNotes,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not save the closing statement.'); return; }
    setEditing(false);
    router.refresh();
  }

  const monthlyInterest = fig.loanAmount * fig.rate / 12;

  return (
    <div className="wrap" style={{ maxWidth: 960 }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Link href={`/admin/loans/${loan.loan_id}`}>&larr; Back to loan</Link>
        <span className="muted" style={{ fontSize: 13 }}>Internal: staff and admins only, never shown to the borrower</span>
      </div>

      {(statement || editing) && (
        <div className="no-print doc-tabs">
          <div className="doc-tabset" role="tablist">
            <button role="tab" aria-selected={view === 'closing'} className={view === 'closing' ? 'on' : ''} onClick={() => setView('closing')}>Closing Statement</button>
            <button role="tab" aria-selected={view === 'lender'} className={view === 'lender' ? 'on' : ''} onClick={() => setView('lender')}>Lender Statement</button>
          </div>
          {statement && !editing && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canEdit && <button className="btn secondary" onClick={() => setEditing(true)}>Edit</button>}
              <a className="btn" style={{ textDecoration: 'none' }} href={`/api/closing-pdf/${loan.loan_id}?doc=${view}`} target="_blank" rel="noopener">Download PDF</a>
            </div>
          )}
        </div>
      )}

      {!statement && !canEdit && (
        <div className="card"><div className="alert info" style={{ margin: 0 }}>No closing statement has been created for this loan yet. An admin can create one.</div></div>
      )}

      {editing && (
        <div className="card no-print" style={{ marginBottom: 20 }}>
          <h2 style={{ color: 'var(--navy)', margin: '0 0 4px' }}>{statement ? 'Edit closing statement' : 'Create closing statement'}</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Loan amount, acquisition, construction, rate and closing date come from the loan. Both statements update as you type.
          </p>
          {error && <div className="alert error">{error}</div>}

          <div className="form-section">Lender &middot; on both statements</div>
          <div className="form-grid">
            <div className="field-wrap">
              <label>Points to Lender (%)</label>
              <input className="field" type="number" step="0.001" min="0" max="100" inputMode="decimal"
                value={form.points} onChange={e => set('points', e.target.value)} placeholder="e.g. 2" />
              <span className="muted hint">{money(fig.points)} &middot; on the total loan amount ({money(fig.loanAmount)})</span>
            </div>
            <div className="field-wrap">
              <label>Interest Reserve (months)</label>
              <input className="field" type="number" step="1" min="0" max="60" inputMode="numeric"
                value={form.months} onChange={e => set('months', e.target.value)} placeholder="e.g. 3" />
              <span className="muted hint">{money(fig.interestReserve)} &middot; {money(monthlyInterest)} a month at {pct(fig.rate)}</span>
            </div>
            <div className="field-wrap">
              <label>Daily Interest (auto)</label>
              <input className="field" value={money(fig.dailyInterest)} readOnly style={{ background: 'var(--pale)' }} />
              <span className="muted hint">{fig.interestDays} days on the acquisition, {fmtDate(loan.closing_date)} to {fmtDate(fig.interestThrough)}</span>
            </div>
          </div>

          <div className="form-section">Broker and other fees &middot; closing statement only</div>
          <div className="form-grid">
            <div className="field-wrap">
              <label>Broker Origination Fee (%)</label>
              <input className="field" type="number" step="0.001" min="0" max="100" inputMode="decimal"
                value={form.broker} onChange={e => set('broker', e.target.value)} placeholder="e.g. 1" />
              <span className="muted hint">{money(fig.brokerFee)} &middot; on the total loan amount</span>
            </div>
            <div className="field-wrap">
              <label>Processing Fee ($)</label>
              <input className="field" type="number" step="0.01" min="0" inputMode="decimal"
                value={form.processing} onChange={e => set('processing', e.target.value)} placeholder="0.00" />
            </div>
            <div className="field-wrap">
              <label>Legal Fee ($)</label>
              <input className="field" type="number" step="0.01" min="0" inputMode="decimal"
                value={form.legal} onChange={e => set('legal', e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="field-wrap" style={{ marginTop: 16 }}>
            <label>Other Fees</label>
            {form.other.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="field" style={{ flex: '2 1 200px', width: 'auto' }} placeholder="Name, e.g. Appraisal Fee"
                  value={o.label} onChange={e => set('other', form.other.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                <input className="field" style={{ flex: '1 1 120px', width: 'auto' }} type="number" step="0.01" min="0" inputMode="decimal" placeholder="Amount"
                  value={o.amount} onChange={e => set('other', form.other.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                <button type="button" className="btn secondary" onClick={() => set('other', form.other.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <div>
              <button type="button" className="btn secondary" onClick={() => set('other', [...form.other, { label: '', amount: '' }])}>
                + Add other fee
              </button>
            </div>
          </div>

          <div className="form-section">Notes</div>
          <div className="form-grid">
            <div className="field-wrap">
              <label>Closing Statement Notes</label>
              <textarea className="field" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
            <div className="field-wrap">
              <label>Lender Statement Notes</label>
              <textarea className="field" rows={3} value={form.lenderNotes} onChange={e => set('lenderNotes', e.target.value)} />
            </div>
          </div>

          <div className="totals-strip">
            <span>Total Closing Cost <b>{money(fig.totalClosingCost)}</b></span>
            <span>Net Wire <b style={{ color: fig.netWire < 0 ? 'var(--danger)' : undefined }}>{money(fig.netWire)}</b></span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn secondary" disabled={busy} onClick={cancel}>Cancel</button>
            <button className="btn" disabled={busy} onClick={save}>
              {busy ? 'Saving...' : statement ? 'Save changes' : 'Create Closing Statement'}
            </button>
          </div>
        </div>
      )}

      {(statement || editing) && (
        <StatementDocument kind={view} loan={loan} fig={fig} notes={notes}
          updatedAt={!editing ? statement?.updated_at : undefined} />
      )}
    </div>
  );
}

/** The statement itself, laid out on the letterhead like the monthly statements. */
function StatementDocument({ kind, loan, fig, notes, updatedAt }: {
  kind: View; loan: any; fig: ClosingFigures; notes: string; updatedAt?: string;
}) {
  const lender = kind === 'lender';
  const lines = lender ? lenderLines(fig) : closingCostLines(fig);
  // Lien position is for the lender only; never on the Closing Statement.
  const position = lender ? lienPositionLabel(loan.lien_position) : '';
  return (
    <div className="card doc">
      <div className="doc-head">
        <Logo variant="stacked" size={30} />
        <div className="doc-rule" />
        <div className="doc-title">{lender ? 'LENDER STATEMENT' : 'CLOSING STATEMENT'}</div>
      </div>

      <div className="contact">
        <div>
          <div className="name">{borrowerDisplayName(loan)}</div>
          <div className="muted">{loan.property}</div>
          {loan.is_entity && loan.entity_name && <div className="muted">{loan.borrower_name}</div>}
          {loan.borrower_phone && <div className="muted">{loan.borrower_phone}</div>}
          {loan.borrower_email && <div className="muted">{loan.borrower_email}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted">Closing Date</div>
          <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmtDate(loan.closing_date)}</div>
          <div className="muted" style={{ marginTop: 6 }}>Loan {loan.loan_number}</div>
        </div>
      </div>

      <div className="summary">
        {/* The grid fills left, right, left, right. Position sits under
            Interest Rate in the right column, so Servicer is pushed to the
            right of the last row (col2) to keep that column together. */}
        <div className="row"><span className="k">Total Loan Amount</span><span className="v">{money(fig.loanAmount)}</span></div>
        <div className="row"><span className="k">Interest Rate</span><span className="v">{pct(loan.annual_rate)}</span></div>
        {position ? (
          <>
            <div className="row"><span className="k">Acquisition</span><span className="v">{money(fig.acquisition)}</span></div>
            <div className="row"><span className="k">Position</span><span className="v">{position}</span></div>
            <div className="row"><span className="k">Construction Holdback</span><span className="v">{money(fig.construction)}</span></div>
            <div className="row"><span className="k">Lender</span><span className="v">{loan.lender_name ?? ''}</span></div>
            <div className="row col2"><span className="k">Servicer</span><span className="v">{BRAND.legal}</span></div>
          </>
        ) : (
          <>
            <div className="row"><span className="k">Acquisition</span><span className="v">{money(fig.acquisition)}</span></div>
            <div className="row"><span className="k">Lender</span><span className="v">{loan.lender_name ?? ''}</span></div>
            <div className="row"><span className="k">Construction Holdback</span><span className="v">{money(fig.construction)}</span></div>
            <div className="row"><span className="k">Servicer</span><span className="v">{BRAND.legal}</span></div>
          </>
        )}
      </div>

      <div className="doc-table">
        <div className="doc-th"><span>{lender ? 'Funding' : 'Closing Costs'}</span><span>Amount</span></div>
        {lines.map((l, i) => (
          <div className="doc-tr" key={i}>
            <span>
              {l.deduct ? 'Less: ' : ''}{l.label}
              {l.detail && <span className="doc-detail">{l.detail}</span>}
            </span>
            <span className="num">{l.deduct ? `(${money(l.amount)})` : money(l.amount)}</span>
          </div>
        ))}
        <div className="doc-total">
          <span>{lender ? 'Net Wire' : 'Total Closing Cost'}</span>
          <span>{money(lender ? fig.netWire : fig.totalClosingCost)}</span>
        </div>
      </div>

      {notes.trim() && (
        <div className="doc-notes"><b>Notes</b><div>{notes}</div></div>
      )}

      <div className="doc-foot">
        <div>{BRAND.legal} &middot; {BRAND.address}</div>
        <div>{BRAND.phone} &middot; {BRAND.email}</div>
        {updatedAt && <div style={{ marginTop: 4 }}>Last updated {fmtDateTime(updatedAt)}</div>}
      </div>
    </div>
  );
}
