import Link from 'next/link';
import { serverClient } from '@/lib/supabase-server';
import PortfolioTable from '@/components/PortfolioTable';
import { pastDueByLoan, dueNowByLoan } from '@/lib/portfolio-health';
import { loadLenderData } from '@/lib/lender-data';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/** The lender's loan list: the staff Loans page, read only. */
export default async function LenderLoansPage() {
  const supabase = serverClient();
  const [{ loans, draws, payments, allocations, error }, { data: { user } }, { data: ownLoans }] = await Promise.all([
    loadLenderData(),
    supabase.auth.getUser(),
    // Their own loans as a borrower, if any -- only to offer a link there.
    supabase.from('loan_summary').select('loan_id').limit(1),
  ]);

  if (error) {
    return (
      <div className="wrap">
        <div className="card"><div className="alert error">Could not load your loans: {error.message}</div></div>
      </div>
    );
  }

  if (user && loans.length) await logActivity('lender_portal_view', null, user.id, `${loans.length} loans`);

  // The same past-due and amount-due figures the staff list shows.
  const pastDue = Object.fromEntries(Array.from(pastDueByLoan(loans, draws, payments, allocations).entries())
    .map(([k, v]) => [k, v.amount]));
  const due = Object.fromEntries(dueNowByLoan(loans, draws, payments, allocations).entries());
  const lenderNames = Array.from(new Set(loans.map(l => l.lender_name).filter(Boolean))) as string[];

  return (
    <div className="wrap">
      <div className="page-head">
        <div className="grow">
          <h1>Loans</h1>
          <div className="sub">
            {lenderNames.length ? `Loans funded by ${lenderNames.join(' & ')}. ` : ''}Click any loan to open it.
          </div>
        </div>
        {(ownLoans ?? []).length > 0 && <Link className="btn secondary" href="/portal">My loans as a borrower</Link>}
      </div>
      {loans.length ? (
        <PortfolioTable loans={loans} canEdit={false} pastDue={pastDue} due={due} basePath="/lender/loans" />
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontWeight: 600, color: 'var(--navy)' }}>No loans are connected to your login yet</div>
          <div className="muted" style={{ marginTop: 4 }}>If you expected to see loans here, please contact Jay Capital Funding.</div>
        </div>
      )}
    </div>
  );
}
