import { isPrivateSignedIn } from '@/lib/private-auth';

export const dynamic = 'force-dynamic';

export default async function LedgerPage() {
  if (!(await isPrivateSignedIn())) return null;
  return (
    <div className="pv-page">
      <div className="pv-page-head">
        <div>
          <h1>Ledger</h1>
          <div className="pv-sub">Track your money</div>
        </div>
      </div>
      <div className="pv-card pv-empty">
        <b>Nothing here yet</b>
        This page will be set up to match your existing spreadsheet.
      </div>
    </div>
  );
}
