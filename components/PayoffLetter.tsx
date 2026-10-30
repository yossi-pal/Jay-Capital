'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { savePayoffLetter } from '@/lib/actions';
import { payoffFigures, autoInterestFrom, longDate, monthEnd, STANDARD_WIRE, type PayoffFigures } from '@/lib/payoff';
import { money, pct, fmtDate, fmtDateTime, todayInAppTz, borrowerDisplayName } from '@/lib/format';
import type { Draw } from '@/lib/interest';
import type { PaymentRow, AllocationRow } from '@/lib/ledger';
import Logo from '@/components/Logo';
import { BRAND } from '@/lib/brand-assets';

interface Stored {
  issued_on: string;
  through_date: string;
  interest_from: string | null;
  demand_prep_fee: number | string;
  wiring_fee: number | string;
  discharge_fee: number | string;
  draw_fee: number | string;
  late_fee: number | string;
  prepayment_pct: number | string;
  wire_instructions: string | null;
  updated_at: string;
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The form's values, kept as typed text so a half-typed number isn't lost. A fee of 0 shows blank. */
function formFrom(s: Stored | null, today: string) {
  const n = (v: number | string | null | undefined) => (Number(v) ? String(Number(v)) : '');
  return {
    through: s?.through_date ?? monthEnd(today),
    interestFrom: s?.interest_from ?? '',          // '' = follow the last payment
    demandPrep: n(s?.demand_prep_fee),
    wiring: n(s?.wiring_fee),
    discharge: n(s?.discharge_fee),
    drawOn: !!Number(s?.draw_fee), drawFee: n(s?.draw_fee),
    lateOn: !!Number(s?.late_fee), lateFee: n(s?.late_fee),
    prepayOn: !!Number(s?.prepayment_pct), prepayPct: n(s?.prepayment_pct),
    wire: s?.wire_instructions ?? '',              // '' = the standard wire details
  };
}

export default function PayoffLetter({ loan, draws, payments, allocations, letter, canEdit }: {
  loan: any; draws: Draw[]; payments: PaymentRow[]; allocations: AllocationRow[];
  letter: Stored | null; canEdit: boolean;
}) {
  const router = useRouter();
  const today = isoDay(todayInAppTz());
  const [editing, setEditing] = useState(!letter && canEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => formFrom(letter, today));
  const [wireEditing, setWireEditing] = useState(false);
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  // On screen the letter follows what is typed; once saved it comes from the stored row.
  const input = editing
    ? {
        through_date: form.through || today,
        interest_from: form.interestFrom || null,
        demand_prep_fee: form.demandPrep, wiring_fee: form.wiring, discharge_fee: form.discharge,
        draw_fee: form.drawOn ? form.drawFee : 0,
        late_fee: form.lateOn ? form.lateFee : 0,
        prepayment_pct: form.prepayOn ? form.prepayPct : 0,
      }
    : { ...letter!, through_date: letter?.through_date ?? today };
  const fig = payoffFigures(loan, draws, payments, allocations, input);
  const auto = autoInterestFrom(loan, draws, allocations, input.through_date);
  const wire = (editing ? form.wire : letter?.wire_instructions ?? '') || STANDARD_WIRE;

  function cancel() {
    setForm(formFrom(letter, today));
    setWireEditing(false);
    setError('');
    if (letter) setEditing(false); else router.push(`/admin/loans/${loan.loan_id}`);
  }

  async function save() {
    setBusy(true); setError('');
    const res = await savePayoffLetter(loan.loan_id, {
      throughDate: form.through,
      interestFrom: form.interestFrom || null,
      demandPrepFee: Number(form.demandPrep) || 0,
      wiringFee: Number(form.wiring) || 0,
      dischargeFee: Number(form.discharge) || 0,
      drawFee: form.drawOn ? Number(form.drawFee) || 0 : 0,
      lateFee: form.lateOn ? Number(form.lateFee) || 0 : 0,
      prepaymentPct: form.prepayOn ? Number(form.prepayPct) || 0 : 0,
      // Unchanged standard details are not stored, so they stay standard.
      wireInstructions: form.wire.trim() && form.wire.trim() !== STANDARD_WIRE ? form.wire : null,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not save the payoff letter.'); return; }
    setEditing(false);
    setWireEditing(false);
    router.refresh();
  }

  return (
    <div className="wrap" style={{ maxWidth: 960 }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Link href={`/admin/loans/${loan.loan_id}`}>&larr; Back to loan</Link>
        <span className="muted" style={{ fontSize: 13 }}>Internal: staff and admins only, never shown to the borrower</span>
      </div>

      {letter && !editing && (
        <div className="no-print doc-tabs">
          <h2 style={{ color: 'var(--navy)', margin: 0 }}>Payoff Letter</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canEdit && <button className="btn secondary" onClick={() => setEditing(true)}>Edit</button>}
            <a className="btn" style={{ textDecoration: 'none' }} href={`/api/payoff-pdf/${loan.loan_id}`} target="_blank" rel="noopener">Download PDF</a>
          </div>
        </div>
      )}

      {!letter && !canEdit && (
        <div className="card"><div className="alert info" style={{ margin: 0 }}>No payoff letter has been created for this loan yet. An admin can create one.</div></div>
      )}

      {editing && (
        <div className="card no-print" style={{ marginBottom: 20 }}>
          <h2 style={{ color: 'var(--navy)', margin: '0 0 4px' }}>{letter ? 'Edit payoff letter' : 'Request payoff'}</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Principal, interest and loan details come from the loan, its draws and its payments. The letter below updates as you type.
          </p>
          {error && <div className="alert error">{error}</div>}

          <div className="form-section">Payoff dates</div>
          <div className="form-grid">
            <div className="field-wrap">
              <label>Statement Through Date</label>
              <input className="field" type="date" value={form.through} min={loan.closing_date}
                onChange={e => set('through', e.target.value)} />
              <span className="muted hint">Interest runs up to and including this day.</span>
            </div>
            <div className="field-wrap">
              <label>Interest From</label>
              <input className="field" type="date" value={form.interestFrom || auto.from} min={loan.closing_date}
                onChange={e => set('interestFrom', e.target.value === auto.from ? '' : e.target.value)} />
              <span className="muted hint">
                {form.interestFrom
                  ? <>Changed by you. <button type="button" className="linkish" onClick={() => set('interestFrom', '')}>Use the date from the last payment ({fmtDate(auto.from)})</button></>
                  : auto.paidThrough
                    ? <>From the last payment: interest is paid through {fmtDate(auto.paidThrough)}.</>
                    : <>No interest payments recorded yet, so it starts at closing.</>}
              </span>
              {fig.unapplied > 0 && (
                <span className="hint" style={{ color: 'var(--danger)' }}>
                  {money(fig.unapplied)} in payments has not been applied to a month, so it is not counted here.
                </span>
              )}
            </div>
            <div className="field-wrap">
              <label>Outstanding Principal (auto)</label>
              <input className="field" value={money(fig.principal)} readOnly style={{ background: 'var(--pale)' }} />
              <span className="muted hint">Acquisition plus {fig.drawCount} draw{fig.drawCount === 1 ? '' : 's'} through the through date.</span>
            </div>
          </div>

          <div className="form-section">Fees &middot; a blank fee is left off the letter</div>
          <div className="form-grid">
            {([['demandPrep', 'Demand Prep Fee ($)'], ['wiring', 'Wiring & Processing Fee ($)'], ['discharge', 'Discharge Fee ($)']] as const).map(([k, label]) => (
              <div className="field-wrap" key={k}>
                <label>{label}</label>
                <input className="field" type="number" step="0.01" min="0" inputMode="decimal"
                  value={form[k]} onChange={e => set(k, e.target.value)} placeholder="0.00" />
              </div>
            ))}
          </div>

          <div className="addon-list">
            <Addon on={form.drawOn} onToggle={v => set('drawOn', v)} label="Add draw fee">
              <input className="field" type="number" step="0.01" min="0" inputMode="decimal" placeholder="Amount per draw"
                value={form.drawFee} onChange={e => set('drawFee', e.target.value)} />
              <span className="muted hint">{fig.drawCount} draw{fig.drawCount === 1 ? '' : 's'} on this loan &middot; {money(fig.fees.drawFeeTotal)}</span>
            </Addon>
            <Addon on={form.lateOn} onToggle={v => set('lateOn', v)} label="Add late fee">
              <input className="field" type="number" step="0.01" min="0" inputMode="decimal" placeholder="Amount ($)"
                value={form.lateFee} onChange={e => set('lateFee', e.target.value)} />
            </Addon>
            <Addon on={form.prepayOn} onToggle={v => set('prepayOn', v)} label="Add prepayment penalty">
              <input className="field" type="number" step="0.001" min="0" max="100" inputMode="decimal" placeholder="% of principal"
                value={form.prepayPct} onChange={e => set('prepayPct', e.target.value)} />
              <span className="muted hint">{money(fig.fees.prepayment)} &middot; on the outstanding principal</span>
            </Addon>
          </div>

          <div className="form-section">Wire instructions</div>
          {wireEditing ? (
            <div className="field-wrap">
              <textarea className="field" rows={9} style={{ fontFamily: 'inherit', lineHeight: 1.5 }} value={form.wire || STANDARD_WIRE} onChange={e => set('wire', e.target.value)} />
              <span className="muted hint">
                Changes apply to this letter only.{' '}
                <button type="button" className="linkish" onClick={() => { set('wire', ''); setWireEditing(false); }}>Use the standard wire details</button>
              </span>
            </div>
          ) : (
            <div className="wire-view">
              <div style={{ whiteSpace: 'pre-line' }}>{wire}</div>
              <button type="button" className="icon-btn" aria-label="Edit wire instructions for this letter" title="Edit for this letter"
                onClick={() => setWireEditing(true)}>&#9998;</button>
            </div>
          )}

          <div className="totals-strip">
            <span>Total Payoff Amount Due <b>{money(fig.total)}</b></span>
            <span>Per diem after {fmtDate(fig.through)} <b>{money(fig.perDiem)}</b></span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn secondary" disabled={busy} onClick={cancel}>Cancel</button>
            <button className="btn" disabled={busy || !form.through} onClick={save}>
              {busy ? 'Saving...' : letter ? 'Save changes' : 'Create Payoff Letter'}
            </button>
          </div>
        </div>
      )}

      {(letter || editing) && (
        <PayoffDocument loan={loan} fig={fig} wire={wire}
          issuedOn={editing ? today : letter!.issued_on}
          updatedAt={!editing ? letter?.updated_at : undefined} />
      )}
    </div>
  );
}

function Addon({ on, onToggle, label, children }: {
  on: boolean; onToggle: (v: boolean) => void; label: string; children: React.ReactNode;
}) {
  return (
    <div className="addon">
      <label className="addon-toggle">
        <input type="checkbox" checked={on} onChange={e => onToggle(e.target.checked)} /> {label}
      </label>
      {on && <div className="addon-body">{children}</div>}
    </div>
  );
}

/** The letter itself, on the letterhead like the other statements. */
function PayoffDocument({ loan, fig, wire, issuedOn, updatedAt }: {
  loan: any; fig: PayoffFigures; wire: string; issuedOn: string; updatedAt?: string;
}) {
  const entity = loan.is_entity && loan.entity_name;
  const contact = [entity ? loan.borrower_name : '', loan.borrower_phone, loan.borrower_email].filter(Boolean).join(' · ');
  return (
    <div className="card doc">
      <div className="doc-head">
        <Logo variant="stacked" size={30} />
        <div className="doc-rule" />
        <div className="doc-title">PAYOFF LETTER</div>
      </div>

      <div className="contact">
        <div>
          <div className="muted" style={{ fontSize: 12 }}>Property Address:</div>
          <div className="name">{loan.property}</div>
          <div><b style={{ color: 'var(--navy)' }}>Borrower:</b> {borrowerDisplayName(loan)}</div>
          {contact && <div className="muted">{contact}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted">Date Issued</div>
          <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{longDate(issuedOn)}</div>
          <div className="muted" style={{ marginTop: 6 }}>Loan {loan.loan_number}</div>
        </div>
      </div>

      <p className="pay-auth">You are authorized to use the following amounts to payoff the above – mentioned loan.</p>

      <div className="doc-table">
        <div className="doc-th"><span>Description</span><span>Amount</span></div>
        {fig.lines.map((l, i) => (
          <div className="doc-tr" key={i}>
            <span>{l.label}</span>
            <span className="num">{l.amount < 0 ? `(${money(-l.amount)})` : money(l.amount)}</span>
          </div>
        ))}
        <div className="doc-total">
          <span>TOTAL PAYOFF AMOUNT DUE</span>
          <span>{money(fig.total)}</span>
        </div>
      </div>
      <p className="pay-perdiem">Please add {money(fig.perDiem)} for each additional day past {fmtDate(fig.through)}.</p>

      <div className="pay-panels">
        <div className="pay-panel">
          <div className="panel-bar">Loan Details</div>
          <div className="summary" style={{ margin: 0, display: 'block' }}>
            <div className="row"><span className="k">Loan Amount</span><span className="v">{money(loan.loan_amount)}</span></div>
            <div className="row"><span className="k">Interest Rate</span><span className="v">{pct(loan.annual_rate)}</span></div>
            <div className="row"><span className="k">Closing Date</span><span className="v">{fmtDate(loan.closing_date)}</span></div>
            <div className="row"><span className="k">Lender</span><span className="v">{loan.lender_name ?? ''}</span></div>
            <div className="row"><span className="k">Interest Paid Through</span><span className="v">{fig.paidThrough < loan.closing_date ? 'Closing' : fmtDate(fig.paidThrough)}</span></div>
            <div className="row"><span className="k">Servicer</span><span className="v">{BRAND.legal}</span></div>
          </div>
        </div>
        <div className="pay-panel">
          <div className="panel-bar">Funds should be wired to</div>
          <div className="wire-body">{wire}</div>
        </div>
      </div>

      <p className="pay-terms">
        This Payoff Letter is valid until 4:00 PM ET on {longDate(fig.validUntil)}. By issuing this Payoff Letter,
        Lender is not waiving any of its rights under any of the loan documents.
      </p>
      <div className="pay-sign">
        <div>Sincerely,</div>
        <div className="who">{BRAND.legal}</div>
        <div className="muted"><i>Loan Servicer, on behalf of {loan.lender_name || 'the Lender'}</i></div>
      </div>

      <div className="doc-foot">
        <div>{BRAND.legal} &middot; {BRAND.address}</div>
        <div>{BRAND.phone} &middot; {BRAND.email}</div>
        {updatedAt && <div style={{ marginTop: 4 }}>Last updated {fmtDateTime(updatedAt)}</div>}
      </div>
    </div>
  );
}
