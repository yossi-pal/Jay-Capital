import { serverClient } from '@/lib/supabase-server';
import LenderManager from '@/components/LenderManager';

export const dynamic = 'force-dynamic';

export default async function LendersPage() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  if (me?.role !== 'admin') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin only.</div></div></div>;
  }

  const { data: lenders } = await supabase
    .from('lenders').select('id, name, short_name, active, payment_method, payment_instructions').order('name');
  const { data: loans } = await supabase.from('loans').select('lender_id, status, loan_amount');

  const stats = new Map<string, { all: number; active: number; committed: number }>();
  for (const l of loans ?? []) {
    if (!l.lender_id) continue;
    const s = stats.get(l.lender_id) ?? { all: 0, active: 0, committed: 0 };
    s.all++;
    if (l.status === 'active') { s.active++; s.committed += Number(l.loan_amount || 0); }
    stats.set(l.lender_id, s);
  }
  const rows = (lenders ?? []).map((l: any) => ({
    ...l,
    loan_count: stats.get(l.id)?.all ?? 0,
    active_loans: stats.get(l.id)?.active ?? 0,
    committed: stats.get(l.id)?.committed ?? 0,
  }));

  return (
    <div className="wrap" style={{ maxWidth: 1400 }}>
      <LenderManager lenders={rows} />
    </div>
  );
}
