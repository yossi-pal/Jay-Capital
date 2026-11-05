import Link from 'next/link';
import { serverClient, serviceClient } from '@/lib/supabase-server';
import { getMe } from '@/lib/session';
import { money, fmtDate, fmtDateTime, firstOfMonth, todayInAppTz, shortAddress, APP_TZ } from '@/lib/format';
import { pastDueByLoan } from '@/lib/portfolio-health';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/** $148k / $1.2M -- for chart labels, where full cents would not fit. */
function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1_000) return '$' + Math.round(n / 1_000) + 'k';
  return '$' + Math.round(n);
}

/**
 * Staff home: what the book looks like today and what needs doing. Every
 * figure comes from the same data and ledger the statements use.
 */
export default async function TodayPage() {
  const supabase = serverClient();
  const { profile: me } = await getMe();
  if (me?.role !== 'admin' && me?.role !== 'staff') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin or staff only.</div></div></div>;
  }
  const isAdmin = me.role === 'admin';

  const svc = serviceClient();
  const [{ data: loans }, { data: draws }, { data: payments }, { data: allocations },
         { data: borrowers }, { data: drawReqs }] = await Promise.all([
    supabase.from('loan_summary').select('*'),
    svc.from('draws').select('loan_id, draw_date, amount, description'),
    svc.from('payments').select('id, loan_id, payment_date, amount, method, note'),
    svc.from('payment_allocations').select('payment_id, loan_id, period_month, amount'),
    svc.from('borrowers').select('id, name, email, user_id'),
    svc.from('draw_requests').select('id, loan_id, amount, requested_at').eq('status', 'pending')
      .order('requested_at', { ascending: true }),
  ]);

  const loanList = loans ?? [];
  const payList = payments ?? [];
  const active = loanList.filter((l: any) => l.status === 'active');

  const committed = active.reduce((s: number, l: any) => s + Number(l.loan_amount || 0), 0);
  const disbursed = active.reduce((s: number, l: any) => s + Number(l.total_disbursed || 0), 0);
  const undrawn = active.reduce((s: number, l: any) => s + Number(l.remaining_draw || 0), 0);

  const lateMap = pastDueByLoan(loanList, draws ?? [], payList, allocations ?? []);
  const late = Array.from(lateMap.entries())
    .map(([id, v]) => ({ ...v, loan: loanList.find((l: any) => l.loan_id === id) }))
    .filter(x => x.loan)
    .sort((a, b) => b.amount - a.amount);
  const lateTotal = late.reduce((s, x) => s + x.amount, 0);

  // Payments by month, New York calendar.
  const today = todayInAppTz();
  const thisMonth = firstOfMonth(today);
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) months.push(firstOfMonth(today, -i));
  const series = months.map(m => {
    const end = firstOfMonth(m, 1);
    const rows = payList.filter((p: any) => p.payment_date >= m && p.payment_date < end);
    return {
      m, total: rows.reduce((s: number, p: any) => s + Number(p.amount), 0), count: rows.length,
      label: new Date(m + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' }),
    };
  });
  const max = Math.max(1, ...series.map(s => s.total));
  const now = series[series.length - 1];

  const noLogin = (borrowers ?? []).filter((b: any) => !b.user_id && b.email);

  // Greeting by the clock in New York.
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: APP_TZ, hour: 'numeric', hour12: false }).format(new Date()));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = (me.full_name || '').trim().split(/\s+/)[0];
  const dateLine = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const attention = late.slice(0, 6);
  // Draw requests borrowers sent from the portal, oldest first.
  const pendingDraws = (drawReqs ?? [])
    .map((r: any) => ({ ...r, loan: loanList.find((l: any) => l.loan_id === r.loan_id) }))
    .filter((r: any) => r.loan);
  const attentionCount = late.length + (noLogin.length ? 1 : 0) + pendingDraws.length;

  return (
    <div className="wrap" style={{ maxWidth: 1400 }}>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">{dateLine}</div>
          <h1>{greet}{first ? `, ${first}` : ''}</h1>
        </div>
        <Link className="btn secondary" href="/admin/loans">All loans</Link>
        {isAdmin && (
          <Link className="btn" href="/admin/loans/new">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D9B676" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            New loan
          </Link>
        )}
      </div>

      <section className="kpis" aria-label="Key numbers">
        <div className="kpi dark">
          <span className="label">Capital deployed</span>
          <span className="value">{money(disbursed)}</span>
          <div className="meter" aria-hidden="true"><i style={{ width: `${committed > 0 ? Math.min(100, (disbursed / committed) * 100) : 0}%` }} /></div>
          <span className="foot">of {money(committed)} committed · {money(undrawn)} left to draw</span>
        </div>
        <Link className="kpi" href="/admin/loans?status=active">
          <span className="label">Active loans</span>
          <span className="value">{active.length}</span>
          <span className="foot">{active.length - late.length} current · {late.length} past due</span>
        </Link>
        <Link className={`kpi${late.length ? ' alert-red' : ''}`} href="/admin/loans?status=late">
          <span className="label">
            <span className="dot" style={{ background: late.length ? '#C8372D' : '#1B7F4F' }} />
            Past due
          </span>
          <span className="value">{late.length} {late.length === 1 ? 'loan' : 'loans'}</span>
          <span className="foot">{late.length ? `${money(lateTotal)} overdue` : 'Everything is up to date'}</span>
        </Link>
        <div className="kpi">
          <span className="label">Received this month</span>
          <span className="value">{money(now.total)}</span>
          <span className="foot">{now.count} {now.count === 1 ? 'payment' : 'payments'} since {fmtDate(thisMonth)}</span>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="panel-head">
            <h2>Needs your attention</h2>
            {attentionCount > 0 && <span className="count">{attentionCount}</span>}
          </div>
          {attentionCount === 0 ? (
            <div className="empty-ok">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>
              All caught up. Nothing is past due and no draw requests are waiting.
            </div>
          ) : (
            <div>
              {pendingDraws.map((r: any) => (
                <Link key={r.id} className="att" href={`/admin/loans/${r.loan.loan_id}`}>
                  <span className="ic gold">Draw</span>
                  <span className="txt">
                    <b>{money(r.amount)} draw requested · {r.loan.loan_number}</b>
                    <span>{r.loan.borrower_name} · {shortAddress(r.loan.property)} · asked {fmtDateTime(r.requested_at)}</span>
                  </span>
                  <span className="go">{isAdmin ? 'Review →' : 'View →'}</span>
                </Link>
              ))}
              {attention.map(x => (
                <Link key={x.loan.loan_id} className="att" href={`/admin/loans/${x.loan.loan_id}`}>
                  <span className="ic red">{x.months}&nbsp;mo</span>
                  <span className="txt">
                    <b>{money(x.amount)} past due · {x.loan.loan_number}</b>
                    <span>{x.loan.borrower_name} · {shortAddress(x.loan.property)} · since {fmtDate(x.oldest)}</span>
                  </span>
                  <span className="go">Open →</span>
                </Link>
              ))}
              {late.length > attention.length && (
                <Link className="att" href="/admin/loans?status=late">
                  <span className="ic red">+{late.length - attention.length}</span>
                  <span className="txt"><b>More past-due loans</b><span>See every past-due loan</span></span>
                  <span className="go">View →</span>
                </Link>
              )}
              {noLogin.length > 0 && (
                <Link className="att" href={isAdmin ? '/admin/users' : '/admin/insights'}>
                  <span className="ic navy">{noLogin.length}</span>
                  <span className="txt">
                    <b>{noLogin.length} {noLogin.length === 1 ? 'borrower hasn’t' : 'borrowers haven’t'} set up portal access</b>
                    <span>{noLogin.slice(0, 3).map((b: any) => b.name).join(', ')}{noLogin.length > 3 ? '…' : ''}</span>
                  </span>
                  <span className="go">{isAdmin ? 'Invite →' : 'View →'}</span>
                </Link>
              )}
            </div>
          )}
        </section>

        <div className="stack">
          <section className="card">
            <div className="panel-head">
              <h2>Payments received</h2>
              <span className="muted" style={{ fontSize: 13 }}>Last 6 months</span>
            </div>
            <div className="bars" role="img"
              aria-label={series.map(s => `${s.label}: ${money(s.total)}`).join(', ')}>
              {series.map((s, i) => (
                <div key={s.m} className={`b${i === series.length - 1 ? ' now' : ''}`}>
                  <span className="v">{compact(s.total)}</span>
                  <i style={{ height: `${Math.round((s.total / max) * 110)}px` }} />
                  <span className="m">{s.label}</span>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
