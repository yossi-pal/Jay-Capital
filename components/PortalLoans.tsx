'use client';

import { useEffect, useMemo, useState } from 'react';
import StatementView, { type StatementData, type StatementDraw, type PayInfo } from '@/components/StatementView';
import { money, pct, fmtDate, shortAddress, clampMonth, defaultStatementMonth, firstOfMonth, todayInAppTz, monthName, statementMonths } from '@/lib/format';
import { buildLedger, pastDueAsOf, type PaymentRow, type AllocationRow } from '@/lib/ledger';
import EmailUs from '@/components/EmailUs';
import Monogram from '@/components/Monogram';

export interface PortalLoan {
  loan: StatementData;
  draws: StatementDraw[];
  payments: PaymentRow[];
  allocations: AllocationRow[];
  payInfo: PayInfo | null;
}

/** The loan as the interest engine wants it -- the same shape StatementView builds. */
function engineOf(p: PortalLoan) {
  const l = p.loan;
  return {
    loan: {
      loan_amount: Number(l.loan_amount), acquisition: Number(l.acquisition),
      annual_rate: Number(l.annual_rate), closing_date: l.closing_date,
      paid_off_date: l.paid_off_date ?? null,
    },
    draws: p.draws.map(d => ({ draw_date: d.draw_date, amount: Number(d.amount), description: d.description })),
  };
}

/**
 * The borrower's home: a welcome card with what is due, a card per loan, then
 * loan details, recent statements, payment history and how to reach us. A
 * statement opens in full below when the borrower picks one. With one loan the
 * loan cards are hidden.
 *
 * The selected loan is remembered per user id, so signing back in returns to
 * the loan they were last looking at.
 */
export default function PortalLoans({
  loans, userId, userEmail, borrowerName,
}: { loans: PortalLoan[]; userId: string; userEmail: string; borrowerName: string }) {
  const key = `jcf:portal:lastLoan:${userId}`;
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<string | null>(null);
  const [showAllStmts, setShowAllStmts] = useState(false);
  const [showAllPays, setShowAllPays] = useState(false);

  function openStatement(m: string) {
    setViewMonth(m);
    // Wait for the statement to render, then bring it into view.
    window.setTimeout(() => {
      document.getElementById('statement-view')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  }

  // Restore after mount: reading storage during render would not match the
  // server-rendered markup.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        const i = loans.findIndex(l => l.loan.loan_id === saved);
        if (i >= 0) setActive(i);
      }
    } catch { /* storage unavailable; first loan is fine */ }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans.length, userId]);

  useEffect(() => {
    if (!ready) return;
    try {
      const id = loans[active]?.loan.loan_id;
      if (id) window.localStorage.setItem(key, id);
    } catch { /* ignore */ }
  }, [active, ready, loans, key]);

  // Past-due state per loan, as of today -- drives the labels on the cards.
  const lateById = useMemo(() => {
    const today = todayInAppTz();
    const m = new Map<string, number>();
    for (const p of loans) {
      if (p.loan.paid_off_date) continue;
      const e = engineOf(p);
      const late = pastDueAsOf(e.loan, e.draws, p.payments, p.allocations, today);
      m.set(p.loan.loan_id ?? p.loan.loan_number, late.reduce((s, r) => s + r.balance, 0));
    }
    return m;
  }, [loans]);

  if (loans.length === 0) {
    return (
      <div className="bwrap" style={{ paddingBottom: 48 }}>
        <div className="card">
          <h2 style={{ color: 'var(--navy)', marginTop: 0 }}>No loans found</h2>
          <p>
            We couldn&apos;t find any loans registered to <b>{userEmail}</b>.
          </p>
          <p className="muted">
            Loans are matched by the email address on file for them. If your loan was
            registered under a different address, update it below — otherwise contact us
            and we&apos;ll get it sorted.
          </p>
          <p className="muted" style={{ marginTop: 16 }}>
            Use <b>Change my email</b> at the top of the page to switch to the address
            your loan is registered under.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            <EmailUs subject="Portal access help" />
            <a className="btn secondary" href="tel:+18458280731">Call (845) 828-0731</a>
          </div>
        </div>
      </div>
    );
  }

  const current = loans[active] ?? loans[0];
  const multi = loans.length > 1;
  const first = (borrowerName || '').trim().split(/\s+/)[0];
  const L = current.loan;

  // What's due, from the same ledger and the same statement month the
  // statement opens on, so the two always agree.
  const e = engineOf(current);
  const todayMonth = firstOfMonth(todayInAppTz());
  const asOf = clampMonth(defaultStatementMonth(), L.closing_date);
  const ledger = buildLedger(e.loan, e.draws, current.payments, current.allocations, asOf);
  const paidOff = !!L.paid_off_date;
  const owes = ledger.amountDue > 0.005;
  const late = owes && !ledger.deferredToNext && asOf <= todayMonth;
  const pay = current.payInfo;
  const hasPay = !!(pay?.instructions || pay?.method);

  // Recent statements, newest first, each with what it asked for.
  // Only the current statement carries an amount: an older statement's
  // "amount due" includes everything carried forward, which would read as
  // though each month owed the whole balance.
  const recent = statementMonths(L.closing_date, L.paid_off_date).slice(0, showAllStmts ? 24 : 5).map(m => {
    if (m > asOf) return { m, sub: `Upcoming · dated ${fmtDate(m)}`, tone: '' };
    if (m < asOf) return { m, sub: `Dated ${fmtDate(m)}`, tone: '' };
    const sub = paidOff ? `Dated ${fmtDate(m)}`
      : ledger.deferredToNext ? 'Nothing billed yet'
      : owes ? `${money(ledger.amountDue)} ${late ? 'past due' : `due ${fmtDate(m)}`}`
      : 'Paid in full';
    return { m, sub, tone: owes && late ? 'late' : !owes && !paidOff ? 'ok' : '' };
  });
  const totalStmts = statementMonths(L.closing_date, L.paid_off_date).length;

  const paymentsDesc = [...current.payments].sort((x, y) => y.payment_date.localeCompare(x.payment_date));
  const drawnPct = Number(L.loan_amount) > 0 ? Math.min(100, (Number(L.total_disbursed) / Number(L.loan_amount)) * 100) : 0;
  const pdfFor = (m: string) => `/api/statement-pdf/${L.loan_id}?month=${m}`;

  return (
    <>
      <div className="bwrap">
        <section className="hero" aria-label="Payment summary">
          <Monogram className="watermark" height={340} />
          <div className="hero-row">
            <div className="hero-main">
              <span className="hi">Hi{first ? ` ${first}` : ''},</span>
              {paidOff ? (
                <>
                  <span className="what">{shortAddress(L.property)}</span>
                  <span className="amt">Paid off</span>
                  <span className="when">Closed out {fmtDate(L.paid_off_date)}. Thank you!</span>
                </>
              ) : ledger.deferredToNext ? (
                <>
                  <span className="what">Your loan on {shortAddress(L.property)}</span>
                  <span className="amt">Nothing due yet</span>
                  <span className="when">Your first interest is billed on your next statement.</span>
                </>
              ) : owes ? (
                <>
                  <span className="what">{late ? 'Past due' : 'Your next payment'} for {shortAddress(L.property)}</span>
                  <span className="amt">{money(ledger.amountDue)}</span>
                  <span className={`when${late ? ' late' : ''}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                    {late ? `Was due ${fmtDate(asOf)} — please pay as soon as you can` : `Due ${fmtDate(asOf)}`}
                  </span>
                </>
              ) : (
                <>
                  <span className="what">{shortAddress(L.property)}</span>
                  <span className="amt">You&apos;re all paid up</span>
                  <span className="when">Nothing is owed on your {monthName(asOf)} statement.</span>
                </>
              )}
            </div>
            <div className="hero-actions">
              {hasPay && !paidOff && (
                <button className="btn gold" type="button" aria-expanded={payOpen} onClick={() => setPayOpen(o => !o)}>
                  {payOpen ? 'Hide payment details' : 'How to pay'}
                </button>
              )}
              <button className="btn ghost-light" type="button" onClick={() => openStatement(asOf)}>Latest statement</button>
            </div>
          </div>
          {payOpen && hasPay && (
            <div className="hero-pay">
              <b>How to pay{pay?.method ? ` — ${pay.method}` : ''}</b>
              {pay?.instructions}
              <div style={{ marginTop: 8, color: '#B7C3D3' }}>Please include your loan number, {L.loan_number}, with your payment.</div>
            </div>
          )}
        </section>

        {multi && (
          <section aria-label="Your loans" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="section-h">Your loans</h2>
            <div className="loancards">
              {loans.map((l, i) => {
                const lateAmt = lateById.get(l.loan.loan_id ?? l.loan.loan_number) ?? 0;
                return (
                  <button
                    key={l.loan.loan_id}
                    type="button"
                    aria-pressed={i === active}
                    className={`loancard${i === active ? ' on' : ''}`}
                    onClick={() => { setActive(i); setPayOpen(false); setViewMonth(null); setShowAllStmts(false); setShowAllPays(false); }}
                  >
                    <span className="top">
                      <span className="addr">{shortAddress(l.loan.property)}</span>
                      {l.loan.paid_off_date
                        ? <span className="chip">Paid off</span>
                        : lateAmt > 0.005
                          ? <span className="chip late">Past due</span>
                          : <span className="chip ok">Current</span>}
                    </span>
                    <span className="meta">{money(l.loan.loan_amount)} loan</span>
                    <span className="bal">{money(l.loan.paid_off_date ? 0 : l.loan.total_disbursed)}</span>
                    <span className="meta">Principal balance</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="bgrid">
          <section className="card bcard">
            <h2 className="bcard-h">Loan details</h2>
            <div className="meter" style={{ height: 8, marginTop: 4 }} aria-hidden="true"><i style={{ width: `${drawnPct}%` }} /></div>
            <div className="muted" style={{ fontSize: 13, margin: '8px 0 6px' }}>
              {money(L.total_disbursed)} of {money(L.loan_amount)} drawn
            </div>
            <div className="kv"><span>Principal balance</span><span>{money(paidOff ? 0 : L.total_disbursed)}</span></div>
            {Number(L.remaining_draw) > 0.005 && !paidOff && (
              <div className="kv"><span>Still available to draw</span><span>{money(L.remaining_draw)}</span></div>
            )}
            <div className="kv"><span>Interest rate</span><span>{pct(L.annual_rate)}</span></div>
            <div className="kv"><span>Payments</span><span>Monthly interest</span></div>
            <div className="kv"><span>Closing date</span><span>{fmtDate(L.closing_date)}</span></div>
            <div className="kv"><span>Property</span><span style={{ maxWidth: '60%' }}>{L.property}</span></div>
            <div className="loanref">Loan reference {L.loan_number}</div>
          </section>

          <section className="card bcard">
            <h2 className="bcard-h">Statements</h2>
            {recent.map(r => (
              <div className="srow" key={r.m}>
                <span className="sicon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></svg>
                </span>
                <span className="stxt">
                  <b>{monthName(r.m)}</b>
                  <span className={r.tone === 'late' ? 'tlate' : r.tone === 'ok' ? 'tok' : ''}>{r.sub}</span>
                </span>
                <button type="button" className="btn secondary sm" onClick={() => openStatement(r.m)}>View</button>
                <a className="btn secondary sm" href={pdfFor(r.m)} target="_blank" rel="noopener" aria-label={`Download ${monthName(r.m)} statement as PDF`}>PDF</a>
              </div>
            ))}
            {totalStmts > 5 && (
              <button type="button" className="linkish" style={{ marginTop: 12, fontWeight: 600 }} onClick={() => setShowAllStmts(v => !v)}>
                {showAllStmts ? 'Show fewer' : `Show all ${totalStmts} statements`}
              </button>
            )}
          </section>

          <section className="card bcard">
              <h2 className="bcard-h">Payment history</h2>
              {paymentsDesc.length === 0 && <p className="muted" style={{ margin: '4px 0 0' }}>No payments recorded yet.</p>}
              {paymentsDesc.slice(0, showAllPays ? 200 : 5).map(p => (
                <div className="prow" key={p.id}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B7F4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>
                  <span className="pd">{fmtDate(p.payment_date)}{p.method ? <span className="muted"> · {p.method}</span> : null}</span>
                  <span className="pa">{money(p.amount)}</span>
                </div>
              ))}
              {paymentsDesc.length > 5 && (
                <button type="button" className="linkish" style={{ marginTop: 12, fontWeight: 600 }} onClick={() => setShowAllPays(v => !v)}>
                  {showAllPays ? 'Show fewer' : `Show all ${paymentsDesc.length} payments`}
                </button>
              )}
            </section>

            <section className="help-card" id="help">
              <div className="t">
                <b>Questions about your loan?</b>
                <span>Your Jay Capital team is here to help.</span>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a className="btn" href="tel:+18458280731">Call (845) 828-0731</a>
                <EmailUs subject={`Question about loan ${L.loan_number}`} label="Email us" />
              </div>
            </section>
        </div>
      </div>

      {viewMonth && (
        <div id="statement-view" style={{ scrollMarginTop: 12 }}>
          <div className="bwrap" style={{ paddingBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 className="section-h">Statement</h2>
              <button type="button" className="btn secondary" onClick={() => setViewMonth(null)}>Close statement</button>
            </div>
          </div>
          <StatementView
            key={`${L.loan_id}:${viewMonth}`}
            loan={L}
            draws={current.draws}
            payments={current.payments}
            allocations={current.allocations}
            payInfo={current.payInfo}
            initialMonth={viewMonth}
          />
        </div>
      )}
      {!viewMonth && <div style={{ height: 48 }} />}
    </>
  );
}
