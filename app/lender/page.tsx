import { redirect } from 'next/navigation';
import Link from 'next/link';
import { serverClient } from '@/lib/supabase-server';
import PortalTitle from '@/components/PortalTitle';
import LiveRefresh from '@/components/LiveRefresh';
import IdleTimeout from '@/components/IdleTimeout';
import Logo from '@/components/Logo';
import { money, pct, fmtDate, shortAddress } from '@/lib/format';
import { pastDueByLoan } from '@/lib/portfolio-health';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * Read-only lender portal: the loans a lender funded, the borrower on each,
 * and every draw and payment.
 *
 * Everything is read as the signed-in user through the lender_* functions
 * (migration 026). Each one returns only the loans whose lender this login is
 * connected to, and only a fixed list of columns. Never read lender data here
 * with the service role.
 */
export default async function LenderPage() {
  const supabase = serverClient();
  const [{ data: { user } }, loansRes, drawsRes, paymentsRes, allocRes, { data: ownLoans }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('lender_loans'),
    supabase.rpc('lender_draws'),
    supabase.rpc('lender_payments'),
    supabase.rpc('lender_allocations'),
    // Their own loans as a borrower, if any -- only to offer a link back.
    supabase.from('loan_summary').select('loan_id').limit(1),
  ]);
  if (!user) redirect('/login?next=/lender');

  const loans: any[] = loansRes.data ?? [];
  const draws: any[] = drawsRes.data ?? [];
  const payments: any[] = paymentsRes.data ?? [];
  const allocations: any[] = allocRes.data ?? [];
  const loadError = loansRes.error || drawsRes.error || paymentsRes.error || allocRes.error;
  const isBorrowerToo = (ownLoans ?? []).length > 0;

  if (loans.length) await logActivity('lender_portal_view', null, user.id, `${loans.length} loans`);

  const lenderNames = Array.from(new Set(loans.map(l => l.lender_name).filter(Boolean))) as string[];
  const title = lenderNames.join(' & ');
  const who = title || user.email || '';
  const initials = who.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]!.toUpperCase()).join('');

  // Past due uses the same ledger the borrower statements use, read only.
  const late = pastDueByLoan(loans, draws, payments, allocations);
  const active = loans.filter(l => l.status === 'active');
  const deployed = active.reduce((s, l) => s + Number(l.total_disbursed || 0), 0);
  const committed = active.reduce((s, l) => s + Number(l.loan_amount || 0), 0);
  const undrawn = active.reduce((s, l) => s + Number(l.remaining_draw || 0), 0);
  const lateTotal = Array.from(late.values()).reduce((s, v) => s + v.amount, 0);

  // Active first, then defaulted, then paid off; by loan number within each.
  const order: Record<string, number> = { active: 0, defaulted: 1, paid_off: 2 };
  const sorted = [...loans].sort((a, b) =>
    (order[a.status] ?? 3) - (order[b.status] ?? 3) || String(a.loan_number).localeCompare(String(b.loan_number)));

  return (
    <>
      <PortalTitle name={title || 'Lender'} />
      <LiveRefresh />
      <IdleTimeout />
      <header className="bhead">
        <div className="bhead-in">
          <Logo size={32} />
          <span className="spacer" />
          <span className="me" title={user.email ?? ''}>
            <span className="av" aria-hidden="true">{initials}</span>
            <span className="nm">{user.email}</span>
          </span>
          {isBorrowerToo && <Link className="btn secondary" href="/portal">My loans</Link>}
          <form action="/auth/signout" method="post" style={{ margin: 0 }}>
            <button className="btn secondary">Sign out</button>
          </form>
        </div>
      </header>

      <main className="wrap lender-wrap">
        <div className="page-head">
          <div className="grow">
            <div className="eyebrow">Lender portal</div>
            <h1>{title || 'Your loans'}</h1>
            <div className="sub">The loans you funded, serviced by Jay Capital Funding. Figures update as draws and payments are recorded.</div>
          </div>
        </div>

        {loadError && (
          <div className="alert error">We could not load your loans just now: {loadError.message}. Please refresh the page.</div>
        )}

        {!loadError && loans.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontWeight: 600, color: 'var(--navy)' }}>No loans are connected to your login yet</div>
            <div className="muted" style={{ marginTop: 4 }}>
              If you expected to see loans here, please contact Jay Capital Funding.
            </div>
          </div>
        )}

        {loans.length > 0 && (
          <>
            <section className="kpis" aria-label="Key numbers">
              <div className="kpi dark">
                <span className="label">Capital deployed</span>
                <span className="value">{money(deployed)}</span>
                <div className="meter" aria-hidden="true"><i style={{ width: `${committed > 0 ? Math.min(100, (deployed / committed) * 100) : 0}%` }} /></div>
                <span className="foot">of {money(committed)} committed · {money(undrawn)} left to draw</span>
              </div>
              <div className="kpi">
                <span className="label">Active loans</span>
                <span className="value">{active.length}</span>
                <span className="foot">{loans.length} in total</span>
              </div>
              <div className={`kpi${late.size ? ' alert-red' : ''}`}>
                <span className="label">
                  <span className="dot" style={{ background: late.size ? '#C8372D' : '#1B7F4F' }} />
                  Past due
                </span>
                <span className="value">{late.size} {late.size === 1 ? 'loan' : 'loans'}</span>
                <span className="foot">{late.size ? `${money(lateTotal)} overdue` : 'Everything is up to date'}</span>
              </div>
            </section>

            <div className="lender-loans">
              {sorted.map(l => {
                const due = late.get(l.loan_id);
                const loanDraws = draws.filter(d => d.loan_id === l.loan_id);
                const loanPays = payments.filter(p => p.loan_id === l.loan_id);
                const chip = l.status === 'paid_off' ? <span className="chip">Paid off</span>
                  : l.status === 'defaulted' ? <span className="chip late">Defaulted</span>
                  : due ? <span className="chip late">Past due</span>
                  : <span className="chip ok">Current</span>;
                return (
                  <section key={l.loan_id} className="card lloan">
                    <div className="lloan-top">
                      <div className="lloan-name">
                        <span className="muted">{l.loan_number}{lenderNames.length > 1 ? ` · ${l.lender_name}` : ''}</span>
                        <b>{shortAddress(l.property) || l.property}</b>
                        <span className="muted">{l.property}</span>
                      </div>
                      {chip}
                    </div>

                    <div className="summary">
                      <div className="col">
                        <div className="row"><span className="k">Borrower</span><span className="v">{l.borrower_name}</span></div>
                        {l.is_entity && l.entity_name && (
                          <div className="row"><span className="k">Entity</span><span className="v">{l.entity_name}</span></div>
                        )}
                        <div className="row"><span className="k">Email</span><span className="v">
                          {l.borrower_email ? <a href={`mailto:${l.borrower_email}`}>{l.borrower_email}</a> : <span className="muted">Not on file</span>}
                        </span></div>
                        <div className="row"><span className="k">Phone</span><span className="v">
                          {l.borrower_phone ? <a href={`tel:${String(l.borrower_phone).replace(/[^0-9+]/g, '')}`}>{l.borrower_phone}</a> : <span className="muted">Not on file</span>}
                        </span></div>
                        <div className="row"><span className="k">Closed</span><span className="v">{fmtDate(l.closing_date)}</span></div>
                        {l.paid_off_date && (
                          <div className="row"><span className="k">Paid off</span><span className="v">{fmtDate(l.paid_off_date)}</span></div>
                        )}
                      </div>
                      <div className="col">
                        <div className="row"><span className="k">Loan amount</span><span className="v">{money(l.loan_amount)}</span></div>
                        <div className="row"><span className="k">Rate</span><span className="v">{pct(l.annual_rate)}</span></div>
                        <div className="row"><span className="k">Principal drawn</span><span className="v">{money(l.total_disbursed)}</span></div>
                        <div className="row"><span className="k">Left to draw</span><span className="v">{money(l.remaining_draw)}</span></div>
                        <div className="row"><span className="k">Payments received</span><span className="v">{money(l.total_paid)}</span></div>
                        {due && (
                          <div className="row"><span className="k" style={{ color: '#A12A22' }}>Past due</span>
                            <span className="v" style={{ color: '#A12A22' }}>{money(due.amount)} · {due.months} {due.months === 1 ? 'month' : 'months'}</span></div>
                        )}
                      </div>
                    </div>

                    <details className="lloan-more">
                      <summary>Draws ({loanDraws.length}) and payments ({loanPays.length})</summary>
                      <h3>Draws</h3>
                      {loanDraws.length ? (
                        <div className="tablescroll narrow">
                          <table className="bordered">
                            <thead><tr><th>Date</th><th>Type</th><th>Method</th><th className="num">Amount</th></tr></thead>
                            <tbody>
                              {loanDraws.map(d => (
                                <tr key={d.id}>
                                  <td>{fmtDate(d.draw_date)}</td>
                                  <td>{d.description}</td>
                                  <td>{d.method || <span className="muted">—</span>}</td>
                                  <td className="num">{money(d.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : <p className="muted">No draws recorded yet.</p>}

                      <h3>Payments</h3>
                      {loanPays.length ? (
                        <div className="tablescroll narrow">
                          <table className="bordered">
                            <thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th></tr></thead>
                            <tbody>
                              {loanPays.map(p => (
                                <tr key={p.id}>
                                  <td>{fmtDate(p.payment_date)}</td>
                                  <td>{p.method || <span className="muted">—</span>}</td>
                                  <td className="num">{money(p.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : <p className="muted">No payments received yet.</p>}
                    </details>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </main>
    </>
  );
}
