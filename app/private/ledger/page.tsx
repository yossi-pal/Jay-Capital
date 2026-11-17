import { isPrivateSignedIn } from '@/lib/private-auth';
import { loadLedger } from '@/lib/personal-ledger';
import { Ledger } from './Ledger';

export const dynamic = 'force-dynamic';

export default async function LedgerPage() {
  // The layout shows the PIN screen when signed out; never load data then.
  if (!(await isPrivateSignedIn())) return null;

  let data;
  try {
    data = await loadLedger();
  } catch {
    return (
      <div className="pv-page">
        <div className="pv-page-head"><h1>Ledger</h1></div>
        <div className="pv-card pv-empty">
          <b>The Ledger is not set up yet</b>
          Its storage has not been created in the database. It will work once that step is done.
        </div>
      </div>
    );
  }
  return <Ledger accounts={data.accounts} entries={data.entries} />;
}
