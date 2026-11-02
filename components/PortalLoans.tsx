'use client';

import { useEffect, useMemo, useState } from 'react';
import StatementView, { type StatementData, type StatementDraw, type PayInfo } from '@/components/StatementView';
import { money, fmtDate, shortAddress, clampMonth, defaultStatementMonth, firstOfMonth, todayInAppTz, monthName } from '@/lib/format';
import { buildLedger, pastDueAsOf, type PaymentRow, type AllocationRow } from '@/lib/ledger';
import EmailUs from '@/components/EmailUs';

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
 * The borrower's home: a welcome card with what is due, a card per loan, and
 * the full statement below. With one loan the loan cards are hidden.
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

  // What's due, from the same ledger and the same statement month the
  // statement below opens on, so the two always agree.
  const e = engineOf(current);
  const asOf = clampMonth(defaultStatementMonth(), current.loan.closing_date);
  const ledger = buildLedger(e.loan, e.draws, current.payments, current.allocations, asOf);
  const paidOff = !!current.loan.paid_off_date;
  const owes = ledger.amountDue > 0.005;
  const late = owes && !ledger.deferredToNext && asOf <= firstOfMonth(todayInAppTz());
  const pdfHref = `/api/statement-pdf/${current.loan.loan_id}?month=${asOf}`;
  const pay = current.payInfo;
  const hasPay = !!(pay?.instructions || pay?.method);

  return (
    <>
      <div className="bwrap">
        <section className="hero" aria-label="Payment summary">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="watermark" src="/logo-mark.svg" alt="" aria-hidden="true" />
          <div className="hero-row">
            <div className="hero-main">
              <span className="hi">Hi{first ? ` ${first}` : ''},</span>
              {paidOff ? (
                <>
                  <span className="what">{shortAddress(current.loan.property)}</span>
                  <span className="amt">Paid off</span>
                  <span className="when">Closed out {fmtDate(current.loan.paid_off_date)}. Thank you!</span>
                </>
              ) : ledger.deferredToNext ? (
                <>
                  <span className="what">Your loan on {shortAddress(current.loan.property)}</span>
                  <span className="amt">Nothing due yet</span>
                  <span className="when">Your first interest is billed on your next statement.</span>
                </>
              ) : owes ? (
                <>
                  <span className="what">Amount due on {shortAddress(current.loan.property)}</span>
                  <span className="amt">{money(ledger.amountDue)}</span>
                  <span className={`when${late ? ' late' : ''}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                    {late ? `Past due — was due ${fmtDate(asOf)}` : `Due ${fmtDate(asOf)}`}
                  </span>
                </>
              ) : (
                <>
                  <span className="what">{shortAddress(current.loan.property)}</span>
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
              <a className="btn ghost-light" href={pdfHref} target="_blank" rel="noopener">Download statement</a>
            </div>
          </div>
          {payOpen && hasPay && (
            <div className="hero-pay">
              <b>How to pay{pay?.method ? ` — ${pay.method}` : ''}</b>
              {pay?.instructions}
              <div style={{ marginTop: 8, color: '#B7C3D3' }}>Please include your loan number, {current.loan.loan_number}, with your payment.</div>
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
                    onClick={() => { setActive(i); setPayOpen(false); }}
                  >
                    <span className="top">
                      <span className="addr">{shortAddress(l.loan.property)}</span>
                      {l.loan.paid_off_date
                        ? <span className="chip">Paid off</span>
                        : lateAmt > 0.005
                          ? <span className="chip late">Past due</span>
                          : <span className="chip ok">Current</span>}
                    </span>
                    <span className="meta">{l.loan.loan_number} · {money(l.loan.loan_amount)} loan</span>
                    <span className="bal">{money(l.loan.paid_off_date ? 0 : l.loan.total_disbursed)}</span>
                    <span className="meta">Principal balance</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <h2 className="section-h" id="statement" style={{ marginBottom: -10 }}>Monthly statement</h2>
      </div>

      <StatementView
        key={current.loan.loan_id}
        loan={current.loan}
        draws={current.draws}
        payments={current.payments}
        allocations={current.allocations}
        payInfo={current.payInfo}
      />
    </>
  );
}
