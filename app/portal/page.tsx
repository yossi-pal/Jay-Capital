import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';
import PortalTitle from '@/components/PortalTitle';
import LiveRefresh from '@/components/LiveRefresh';
import IdleTimeout from '@/components/IdleTimeout';
import Logo from '@/components/Logo';
import PortalLoans, { type PortalLoan } from '@/components/PortalLoans';
import { fetchStatementExtras } from '@/lib/statement-data';
import { logActivity } from '@/lib/activity';
import ChangeEmailButton from '@/components/ChangeEmailButton';
import { DRAW_REQUEST_COLUMNS, type DrawRequestRow } from '@/lib/draw-requests';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default async function PortalPage() {
  const supabase = serverClient();
  // Read as the signed-in user, never the service role: row level security is
  // what guarantees a borrower only ever sees their own loans.
  const [{ data: { user } }, { data: loans }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('loan_summary').select('*').order('loan_number'),
  ]);
  // Middleware only checks that a sign-in cookie exists; this confirms it with Supabase.
  if (!user) redirect('/login?next=/portal');
  const list = loans ?? [];

  // The person, not the entity: statements are the only place the entity leads.
  const borrowerName = list.length ? list[0].borrower_name : '';

  const who: string = borrowerName || user?.email || '';
  const initials = who.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]!.toUpperCase()).join('');

  const Nav = (
    <header className="bhead">
      <div className="bhead-in">
        <Logo size={32} />
        <span className="spacer" />
        <span className="me" title={user?.email ?? ''}>
          <span className="av" aria-hidden="true">{initials}</span>
          <span className="nm">{borrowerName || user?.email}</span>
        </span>
        <ChangeEmailButton userEmail={user?.email ?? ''} />
        <form action="/auth/signout" method="post" style={{ margin: 0 }}>
          <button className="btn secondary">Sign out</button>
        </form>
      </div>
    </header>
  );

  // Every loan is loaded at the same time (and the visit is recorded
  // alongside), instead of one loan after another.
  const [items] = await Promise.all([
    Promise.all(list.map(async (loan: any): Promise<PortalLoan> => {
      const [{ data: draws }, extras, { data: requests }] = await Promise.all([
        supabase.from('draw_details').select('*').eq('loan_id', loan.loan_id).order('draw_date'),
        fetchStatementExtras(loan.loan_id, { requireUserAccess: true }),
        // Read as the borrower: row level security returns only their own requests.
        supabase.from('draw_requests').select(DRAW_REQUEST_COLUMNS).eq('loan_id', loan.loan_id)
          .order('requested_at', { ascending: false }),
      ]);
      return {
        loan, draws: draws ?? [], drawRequests: (requests ?? []) as DrawRequestRow[],
        payments: extras.payments, allocations: extras.allocations, payInfo: extras.payInfo,
      };
    })),
    list.length
      ? logActivity('portal_view', list[0].loan_id, user?.id ?? null,
          list.length > 1 ? `${list.length} loans` : list[0].property)
      : Promise.resolve(),
  ]);

  return (
    <>
      <PortalTitle name={borrowerName} />
      <LiveRefresh />
      <IdleTimeout />
      {Nav}
      <PortalLoans loans={items} userId={user?.id ?? ''} userEmail={user?.email ?? ''} borrowerName={borrowerName} />
    </>
  );
}
