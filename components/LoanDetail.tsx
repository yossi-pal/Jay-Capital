'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, pct, fmtDate, firstOfMonth, monthName, clampMonth, statementMonths, todayInAppTz, defaultStatementMonth, lienPositionLabel, shortAddress } from '@/lib/format';
import { buildStatement, drawInterest, type Draw as EngineDraw } from '@/lib/interest';
import { deleteDraw, setLoanStatus, deletePayment } from '@/lib/actions';
import { buildLedger, pastDueAsOf, reserveFields, type PaymentRow, type AllocationRow } from '@/lib/ledger';
import AddPaymentModal from '@/components/AddPaymentModal';
import EmailStatementControls from '@/components/EmailStatementControls';
import AddDrawModal from '@/components/AddDrawModal';
import AddBorrowerModal from '@/components/AddBorrowerModal';
import { ConfirmDialog, AlertDialog } from '@/components/Modal';
import LoanPager from '@/components/LoanPager';
import MarkPaidOffModal, { signedMoney } from '@/components/MarkPaidOffModal';
import type { PayoffQuote } from '@/lib/payoff';
import { PendingDrawRequests, DrawRequestHistory } from '@/components/DrawRequestsPanel';
import type { DrawRequestRow } from '@/lib/draw-requests';

interface Summary {
  loan_id: string; loan_number: string; property: string; loan_amount: number;
  acquisition: number; construction: number; annual_rate: number; closing_date: string;
  status: string; borrower_id: string; borrower_name: string;
  is_entity?: boolean | null; entity_name?: string | null;
  paid_off_date?: string | null;
  borrower_email: string | null; borrower_phone: string | null; lender_name: string | null;
  total_disbursed: number; remaining_draw: number; accrued_interest: number;
}
interface DrawRow { id: string; draw_date: string; description: string; amount: number; interest_accrued: number | null; method?: string | null; note?: string | null; }

export default function LoanDetail({
  summary, draws, payments = [], allocations = [], canEdit, canSend, hasClosingStatement = false, hasPayoffLetter = false, payoffQuote = null, payoffDefaults = null, loanPayoff = null, lienPosition = null, fallbackOrder = [], drawRequests = [],
}: {
  summary: Summary; draws: DrawRow[];
  payments?: PaymentRow[]; allocations?: AllocationRow[];
  canEdit: boolean; canSend: boolean; hasClosingStatement?: boolean; hasPayoffLetter?: boolean; lienPosition?: number | null;
  /** The saved payoff letter's quote, and its late and discharge fees to start the paid-off form from. */
  payoffQuote?: PayoffQuote | null;
  payoffDefaults?: { lateFee: number; dischargeFee: number } | null;
  /** The recorded payoff once the loan is paid off (staff and admin only). */
  loanPayoff?: { amount_received: number; late_fee: number; discharge_fee: number; difference: number | null } | null;
  fallbackOrder?: { id: string; label: string }[];
  /** Draw requests the borrower sent from the portal. */
  drawRequests?: DrawRequestRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const rate = Number(summary.annual_rate);
  const [stmtDate, setStmtDate] = useState(() => clampMonth(defaultStatementMonth(), summary.closing_date));
  const months = statementMonths(summary.closing_date, summary.paid_off_date);

  const [confirmDeleteDraw, setConfirmDeleteDraw] = useState<string | null>(null);
  const [confirmDeletePayment, setConfirmDeletePayment] = useState<string | null>(null);
  const [payoffOpen, setPayoffOpen] = useState(false);

  // Controlled, not defaultValue: defaultValue only applies on mount, so after
  // the payoff modal reverted the select and refreshed, it kept showing the old
  // status until a full reload. Active and Defaulted looked instant only
  // because the user's own click had already moved the select.
  const [statusValue, setStatusValue] = useState(summary.status);
  useEffect(() => { setStatusValue(summary.status); }, [summary.status]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'statement' | 'payments' | 'draws'>('overview');

  const engineLoan = {
    loan_amount: Number(summary.loan_amount), acquisition: Number(summary.acquisition),
    annual_rate: rate, closing_date: summary.closing_date,
    paid_off_date: summary.paid_off_date ?? null,
    ...reserveFields(summary),
  };
  const engineDraws: EngineDraw[] = draws.map(d => ({ draw_date: d.draw_date, amount: Number(d.amount), description: d.description }));
  const stmt = buildStatement(engineLoan, engineDraws, stmtDate);
  const ledger = buildLedger(engineLoan, engineDraws, payments, allocations, stmtDate);
  // Overdue as of today, independent of which statement month is on screen.
  const overdueNow = pastDueAsOf(engineLoan, engineDraws, payments, allocations, todayInAppTz());

  const pdfHref = `/api/statement-pdf/${summary.loan_id}?month=${stmtDate}`;
  const go = (delta: number) => setStmtDate(cur => clampMonth(firstOfMonth(cur, delta), summary.closing_date));

  // months is newest-first; disable each arrow once there is nowhere to go.
  const atNewest = stmtDate >= months[0];
  const atOldest = stmtDate <= months[months.length - 1];

  async function doDeleteDraw(id: string) {
    setConfirmDeleteDraw(null);
    setBusy(true);
    const res = await deleteDraw(summary.loan_id, id);
    setBusy(false);
    if (!res.ok) { setActionError(res.error || 'Could not delete the draw.'); return; }
    router.refresh();
  }

  const construction = draws.filter(d => d.description === 'Construction Draw');

  // What the current statement asks for (the month the borrower's portal opens
  // on), independent of which month the Statement tab is showing.
  const dueMonth = clampMonth(defaultStatementMonth(), summary.closing_date);
  const dueLedger = buildLedger(engineLoan, engineDraws, payments, allocations, dueMonth);
  const lateTotal = overdueNow.reduce((s, r) => s + r.balance, 0);
  const paidOff = summary.status === 'paid_off';
  const isLate = !paidOff && lateTotal > 0.005;
  const drawnPct = Number(summary.loan_amount) > 0
    ? Math.min(100, (Number(summary.total_disbursed) / Number(summary.loan_amount)) * 100) : 0;
  const statusChip = paidOff ? <span className="chip">Paid off</span>
    : summary.status === 'defaulted' ? <span className="chip late">Defaulted</span>
    : isLate ? <span className="chip late">Past due</span>
    : <span className="chip ok">Current</span>;

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'statement', label: 'Statement' },
    { key: 'payments', label: `Payments · ${payments.length}` },
    { key: 'draws', label: `Draws · ${construction.length}` },
  ];

  return (
    <div className="wrap" style={{ maxWidth: 1400 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 12, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <Link href="/admin/loans" style={{ textDecoration: 'none', fontWeight: 600 }}>&larr; All loans</Link>
        <LoanPager currentId={summary.loan_id} fallbackOrder={fallbackOrder} />
      </div>

      {/* Header: the property, who it belongs to, and what you can do */}
      <div className="loan-head">
        <div className="grow">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1>{shortAddress(summary.property)}</h1>
            {statusChip}
          </div>
          <div className="sub">
            {summary.loan_number} · {summary.is_entity && summary.entity_name ? `${summary.entity_name} · ` : ''}
            {summary.borrower_name}{summary.lender_name ? ` · Lender: ${summary.lender_name}` : ''}
          </div>
        </div>
        <div className="loan-actions">
          {canEdit && (
            <select className="filter" aria-label="Loan status" value={statusValue} disabled={busy}
              onChange={async e => {
                const next = e.target.value;
                // Paid off needs a date before anything is written.
                if (next === 'paid_off') {
                  setPayoffOpen(true);
                  return;   // the select stays put until the date is confirmed
                }
                const previous = statusValue;
                setStatusValue(next);
                setBusy(true);
                const res = await setLoanStatus(summary.loan_id, next);
                setBusy(false);
                if (!res.ok) {
                  setStatusValue(previous);   // put it back if the write failed
                  setActionError(res.error || 'Could not change the status.');
                  return;
                }
                router.refresh();
              }}>
              <option value="active">Active</option>
              <option value="paid_off">Paid off</option>
              <option value="defaulted">Defaulted</option>
            </select>
          )}
          {(hasClosingStatement || canEdit) && (canEdit || canSend) && (
            <Link className="btn secondary" href={`/admin/loans/${summary.loan_id}/closing-statement`}>
              {hasClosingStatement ? 'Closing statement' : 'Create closing statement'}
            </Link>
          )}
          {(hasPayoffLetter || canEdit) && (canEdit || canSend) && (
            <Link className="btn secondary" href={`/admin/loans/${summary.loan_id}/payoff`}>
              {hasPayoffLetter ? 'Payoff letter' : 'Request payoff'}
            </Link>
          )}
          {loanPayoff && (canEdit || canSend) && (
            <Link className="btn secondary" href={`/admin/loans/${summary.loan_id}/lender-payoff`}>Lender payoff statement</Link>
          )}
          {canEdit && <Link className="btn secondary" href={`/admin/loans/${summary.loan_id}/edit`}>Edit</Link>}
          {canEdit && <AddDrawModal loanId={summary.loan_id} />}
          {canEdit && (
            <AddPaymentModal
              loanId={summary.loan_id} loan={engineLoan} draws={engineDraws}
              payments={payments} allocations={allocations}
            />
          )}
        </div>
      </div>

      <PendingDrawRequests
        requests={drawRequests} canEdit={canEdit}
        available={Number(summary.remaining_draw || 0)} hasEmail={!!summary.borrower_email}
      />

      {/* The four numbers that matter */}
      <section className="kpis" aria-label="Loan summary">
        <div className="kpi dark">
          <span className="label">Principal outstanding</span>
          <span className="value">{money(paidOff ? 0 : summary.total_disbursed)}</span>
          <div className="meter" aria-hidden="true"><i style={{ width: `${drawnPct}%` }} /></div>
          <span className="foot">{money(summary.total_disbursed)} of {money(summary.loan_amount)} drawn</span>
        </div>
        <div className="kpi">
          <span className="label">{paidOff ? 'Paid off' : 'Current statement'}</span>
          <span className="value">{paidOff ? fmtDate(summary.paid_off_date) : money(dueLedger.amountDue)}</span>
          <span className="foot">
            {paidOff ? (loanPayoff ? `Received ${money(loanPayoff.amount_received)}` : 'No further interest or statements')
              : dueLedger.deferredToNext ? 'Nothing billed yet — first bill next statement'
              : `Due ${fmtDate(dueMonth)}`}
          </span>
        </div>
        <div className="kpi">
          <span className="label">Interest rate</span>
          <span className="value">{pct(summary.annual_rate)}</span>
          <span className="foot">Closed {fmtDate(summary.closing_date)}</span>
        </div>
        <div className={`kpi${isLate ? ' alert-red' : ''}`}>
          <span className="label">
            <span className="dot" style={{ background: isLate ? '#C8372D' : '#1B7F4F' }} />Past due
          </span>
          <span className="value">{isLate ? money(lateTotal) : '$0.00'}</span>
          <span className="foot">
            {isLate
              ? `${overdueNow.length} statement${overdueNow.length === 1 ? '' : 's'}, oldest ${fmtDate(overdueNow[0].statementDate)}`
              : 'Up to date'}
          </span>
        </div>
      </section>

      <div className="card" style={{ padding: 0 }}>
        <div className="tabs" role="tablist" aria-label="Loan sections">
          {tabs.map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              className={`tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="tab-body">
          {tab === 'overview' && (
            <>
              <div className="grid-2" style={{ gap: 32 }}>
                <div>
                  <h2 className="tab-h">Loan terms</h2>
                  <div className="summary" style={{ gridTemplateColumns: '1fr', margin: 0 }}>
                    <div className="col">
                      <div className="row"><span className="k">Loan amount</span><span className="v">{money(summary.loan_amount)}</span></div>
                      <div className="row"><span className="k">Acquisition</span><span className="v">{money(summary.acquisition)}</span></div>
                      <div className="row"><span className="k">Construction budget</span><span className="v">{money(summary.construction)}</span></div>
                      <div className="row"><span className="k">Total draw</span><span className="v">{money(Number(summary.total_disbursed) - Number(summary.acquisition))}</span></div>
                      <div className="row"><span className="k">Remaining draw</span><span className="v">{money(summary.remaining_draw)}</span></div>
                      <div className="row"><span className="k">Interest rate</span><span className="v">{pct(summary.annual_rate)}</span></div>
                      <div className="row"><span className="k">Closing date</span><span className="v">{fmtDate(summary.closing_date)}</span></div>
                      <div className="row"><span className="k">Lien position</span><span className="v">{lienPositionLabel(lienPosition) || 'Not set'}</span></div>
                      <div className="row"><span className="k">Lender</span><span className="v">{summary.lender_name ?? ''}</span></div>
                    </div>
                  </div>
                </div>
                <div>
                  <h2 className="tab-h">Borrower</h2>
                  <div className="summary" style={{ gridTemplateColumns: '1fr', margin: 0 }}>
                    <div className="col">
                      <div className="row"><span className="k">Name</span><span className="v">{summary.borrower_name}</span></div>
                      {summary.is_entity && summary.entity_name && (
                        <div className="row"><span className="k">Entity</span><span className="v">{summary.entity_name}</span></div>
                      )}
                      <div className="row"><span className="k">Email</span><span className="v">{summary.borrower_email || <span className="muted">none on file</span>}</span></div>
                      <div className="row"><span className="k">Phone</span><span className="v">{summary.borrower_phone || <span className="muted">none on file</span>}</span></div>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="alert info" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
                      <span>
                        Borrowers reach their statements by signing in, so every view is recorded
                        against their account.
                      </span>
                      <AddBorrowerModal
                        loanId={summary.loan_id} borrowerId={summary.borrower_id}
                        borrowerName={summary.borrower_name} borrowerEmail={summary.borrower_email}
                      />
                    </div>
                  )}
                </div>
              </div>
              {ledger.unapplied > 0.005 && (
                <p className="muted" style={{ marginBottom: 0 }}>
                  {money(ledger.unapplied)} in payments has not been applied to a specific month yet.
                </p>
              )}
            </>
          )}

          {tab === 'statement' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                <h2 className="tab-h" style={{ margin: 0 }}>Statement preview</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn secondary" onClick={() => go(-1)} disabled={atOldest}
                    title={atOldest ? 'This is the first statement for this loan' : undefined}>
                    &larr; Prev
                  </button>
                  <select className="filter" aria-label="Statement month" value={stmtDate} onChange={e => setStmtDate(e.target.value)}>
                    {months.map(m => <option key={m} value={m}>{monthName(m)}</option>)}
                  </select>
                  <button className="btn secondary" onClick={() => go(1)} disabled={atNewest}
                    title={atNewest ? 'This is the most recent statement' : undefined}>
                    Next &rarr;
                  </button>
                  <a className="btn secondary" href={`${pdfHref}&view=1`} target="_blank" rel="noopener">Preview PDF</a>
                  <a className="btn" href={pdfHref} target="_blank" rel="noopener">Download PDF</a>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                Statement date {fmtDate(stmtDate)}
                {ledger.deferredToNext && ' · nothing billed yet — closing-month interest defers to the next statement'}
                {ledger.currentPeriods.length > 1 &&
                  ` · bills ${ledger.currentPeriods.map(c => c.label).join(' + ')}`}
              </p>
              <div className="summary">
                <div className="col">
                  <div className="row"><span className="k">Total disbursed (as of period)</span><span className="v">{money(stmt.totalDisbursed)}</span></div>
                  <div className="row"><span className="k">Base balance interest</span><span className="v">{money(stmt.baseInterest)}</span></div>
                  <div className="row"><span className="k">Previous balance</span><span className="v">{money(ledger.previousBalance)}</span></div>
                  <div className="row"><span className="k">Previous open balance</span><span className="v">{money(ledger.previousOpenBalance)}</span></div>
                </div>
                <div className="col">
                  <div className="row"><span className="k">Total draws this period</span><span className="v">{money(stmt.periodDrawTotal)}</span></div>
                  <div className="row"><span className="k">Interest accrued this period</span><span className="v">{money(stmt.periodDrawInterest)}</span></div>
                  <div className="row"><span className="k">Payments received</span><span className="v">{ledger.paymentsThisPeriod > 0 ? `(${money(ledger.paymentsThisPeriod)})` : money(0)}</span></div>
                  {ledger.currentReserve > 0 && <>
                    <div className="row"><span className="k">Interest this period</span><span className="v">{money(ledger.currentInterest)}</span></div>
                    <div className="row"><span className="k">Less interest reserve</span><span className="v">({money(ledger.currentReserve)})</span></div>
                  </>}
                  <div className="row"><span className="k">Current charges</span><span className="v">{money(ledger.currentCharge)}</span></div>
                </div>
                {/* Its own grid cell: under the left column on a computer, last on a phone. */}
                <div className="col">
                  <div className="row due"><span className="k">Amount Due</span><span className="v">{money(ledger.amountDue)}</span></div>
                </div>
              </div>
              {paidOff && summary.paid_off_date && (
                <p style={{ marginBottom: 0, color: 'var(--ok)', fontWeight: 600 }}>
                  Paid off {fmtDate(summary.paid_off_date)} · no further interest or statements.
                  {loanPayoff && (canEdit || canSend) && (
                    <span style={{ color: 'var(--ink)', fontWeight: 400 }}>
                      {' '}· Received {money(loanPayoff.amount_received)}
                      {loanPayoff.difference !== null && (
                        <> · difference <b style={{ color: loanPayoff.difference < -0.005 ? 'var(--danger)' : 'var(--ok)' }}>{signedMoney(loanPayoff.difference)}</b> vs. the payoff letter</>
                      )}
                    </span>
                  )}
                </p>
              )}
              {canSend && (
                <div style={{ marginTop: 28, paddingTop: 22, borderTop: '1px solid var(--hair)' }}>
                  <h2 className="tab-h">Email statement to borrower</h2>
                  <EmailStatementControls loanId={summary.loan_id} closingDate={summary.closing_date} borrowerEmail={summary.borrower_email} />
                </div>
              )}
            </>
          )}

          {tab === 'payments' && (
            <>
              <div className="tablescroll">
                <table className="bordered">
                  <thead><tr><th>Date</th><th>Method</th><th>Note</th><th>Applied To</th><th className="num">Amount</th>{canEdit && <th></th>}</tr></thead>
                  <tbody>
                    {payments.map(p => {
                      const mine = allocations.filter(a => a.payment_id === p.id);
                      return (
                        <tr key={p.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.payment_date)}</td>
                          <td>{p.method || ''}</td>
                          <td>{p.note || ''}</td>
                          <td>{mine.length ? mine.map(a => `${monthName(a.period_month)} ${money(a.amount)}`).join(', ') : <span className="muted">unapplied</span>}</td>
                          <td className="num" style={{ fontWeight: 600 }}>{money(p.amount)}</td>
                          {canEdit && (
                            <td className="num">
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <AddPaymentModal
                                  key={`edit-${p.id}`}
                                  loanId={summary.loan_id} loan={engineLoan} draws={engineDraws}
                                  payments={payments} allocations={allocations} editing={p}
                                />
                                <button className="btn danger" disabled={busy}
                                  onClick={() => setConfirmDeletePayment(p.id)}>Delete</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {payments.length === 0 && <tr><td colSpan={canEdit ? 6 : 5} className="muted" style={{ textAlign: 'center', padding: 28 }}>No payments recorded yet.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Oldest first.</p>
            </>
          )}

          {tab === 'draws' && (
            <>
            <div className="tablescroll">
              <table className="bordered">
                <thead><tr><th>Date</th><th>Method</th><th>Note</th><th className="num">Amount</th><th className="num">Interest Accrued</th>{canEdit && <th></th>}</tr></thead>
                <tbody>
                  {construction.map(d => (
                    <tr key={d.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(d.draw_date)}</td>
                      <td>{d.method || ''}</td>
                      <td>{d.note || ''}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{money(d.amount)}</td>
                      <td className="num">{money(drawInterest(Number(d.amount), rate, d.draw_date))}</td>
                      {canEdit && (
                        <td className="num">
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <AddDrawModal loanId={summary.loan_id} editing={d} />
                            <button className="btn danger" disabled={busy}
                              onClick={() => setConfirmDeleteDraw(d.id)}>Delete</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {construction.length === 0 && <tr><td colSpan={canEdit ? 6 : 5} className="muted" style={{ textAlign: 'center', padding: 28 }}>No draws yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <DrawRequestHistory requests={drawRequests} />
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDeleteDraw}
        title="Delete draw"
        message="Delete this construction draw? This cannot be undone."
        confirmLabel="Delete draw" danger
        onConfirm={() => confirmDeleteDraw && doDeleteDraw(confirmDeleteDraw)}
        onCancel={() => setConfirmDeleteDraw(null)}
      />
      <ConfirmDialog
        open={!!confirmDeletePayment}
        title="Delete payment"
        message="Remove this payment? Anything it was applied to becomes outstanding again."
        confirmLabel="Delete payment" danger
        onConfirm={async () => {
          const id = confirmDeletePayment; setConfirmDeletePayment(null);
          if (!id) return;
          setBusy(true);
          const res = await deletePayment(summary.loan_id, id);
          setBusy(false);
          if (!res.ok) { setActionError(res.error || 'Could not delete the payment.'); return; }
          router.refresh();
        }}
        onCancel={() => setConfirmDeletePayment(null)}
      />
      <MarkPaidOffModal
        open={payoffOpen}
        onClose={() => { setPayoffOpen(false); setStatusValue(summary.status); }}
        onSaved={() => { setStatusValue('paid_off'); setPayoffOpen(false); router.refresh(); }}
        loan={summary} draws={engineDraws} payments={payments} allocations={allocations}
        quote={payoffQuote}
        defaults={{
          payoffDate: summary.paid_off_date,
          amountReceived: loanPayoff?.amount_received,
          lateFee: loanPayoff?.late_fee ?? payoffDefaults?.lateFee,
          dischargeFee: loanPayoff?.discharge_fee ?? (payoffDefaults?.dischargeFee || undefined),
        }}
      />

      <AlertDialog
        open={!!actionError}
        title="That didn't work"
        message={actionError || ''}
        tone="error"
        onClose={() => setActionError(null)}
      />
    </div>
  );
}
