import { serverClient, serviceClient } from '@/lib/supabase-server';
import PortfolioTable from '@/components/PortfolioTable';
import { pastDueByLoan, dueNowByLoan } from '@/lib/portfolio-health';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default async function LoansPage() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: loans, error }, { data: profile }] = await Promise.all([
    supabase.from('loan_summary').select('*').order('loan_number', { ascending: true }),
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').single(),
  ]);

  if (error) {
    return (
      <div className="wrap">
        <div className="card">
          <div className="alert error">Could not load loans: {error.message}</div>
        </div>
      </div>
    );
  }

  // Past-due flags. Read with the service client only after confirming the
  // signed-in user is staff, exactly as the Insights page does.
  const list = loans ?? [];
  let pastDue: Record<string, number> = {};
  let due: Record<string, { amount: number; date: string; deferred: boolean }> = {};
  if (profile?.role === 'admin' || profile?.role === 'staff') {
    const svc = serviceClient();
    const [{ data: draws }, { data: payments }, { data: allocations }] = await Promise.all([
      svc.from('draws').select('loan_id, draw_date, amount, description'),
      svc.from('payments').select('id, loan_id, payment_date, amount, method, note'),
      svc.from('payment_allocations').select('payment_id, loan_id, period_month, amount'),
    ]);
    const map = pastDueByLoan(list, draws ?? [], payments ?? [], allocations ?? []);
    pastDue = Object.fromEntries(Array.from(map.entries()).map(([k, v]) => [k, v.amount]));
    due = Object.fromEntries(dueNowByLoan(list, draws ?? [], payments ?? [], allocations ?? []).entries());
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <div className="grow">
          <h1>Loans</h1>
          <div className="sub">Your whole portfolio. Click any loan to open it.</div>
        </div>
        {profile?.role === 'admin' && (
          <Link className="btn" href="/admin/loans/new">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D9B676" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            New loan
          </Link>
        )}
      </div>
      <PortfolioTable loans={list} canEdit={profile?.role === 'admin'} pastDue={pastDue} due={due} />
    </div>
  );
}
