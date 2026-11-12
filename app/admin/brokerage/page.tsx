import { serverClient } from '@/lib/supabase-server';
import { getMe } from '@/lib/session';
import BrokerageManager, { type BrokerageRow } from '@/components/BrokerageManager';

export const dynamic = 'force-dynamic';

export default async function BrokeragePage() {
  const { profile: me } = await getMe();
  if (me?.role !== 'admin' && me?.role !== 'staff') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin or staff only.</div></div></div>;
  }

  const supabase = serverClient();
  const { data, error } = await supabase.from('brokerage_loans')
    .select('id, property, loan_amount, closing_date, lender')
    .order('closing_date', { ascending: false });

  return (
    <div className="wrap" style={{ maxWidth: 1200 }}>
      {error && <div className="alert error">Could not load brokerage loans: {error.message}</div>}
      <BrokerageManager rows={(data ?? []) as BrokerageRow[]} canEdit={me?.role === 'admin'} />
    </div>
  );
}
