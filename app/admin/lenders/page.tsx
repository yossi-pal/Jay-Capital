import { serverClient } from '@/lib/supabase-server';
import { getMe } from '@/lib/session';
import LenderManager from '@/components/LenderManager';

export const dynamic = 'force-dynamic';

export default async function LendersPage() {
  const supabase = serverClient();
  const { profile: me } = await getMe();
  if (me?.role !== 'admin') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin only.</div></div></div>;
  }

  const [{ data: lenders }, { data: loans }, { data: logins }] = await Promise.all([
    supabase.from('lenders').select('id, name, short_name, active, payment_method, payment_instructions').order('name'),
    supabase.from('loans').select('lender_id, status, loan_amount'),
    supabase.from('lender_logins').select('id, lender_id, email, full_name, user_id').order('created_at'),
  ]);

  // Invitation status for each login's account (admins can read all profiles).
  const userIds = Array.from(new Set((logins ?? []).map((x: any) => x.user_id).filter(Boolean)));
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, invited_at, activated_at, last_seen_at, active').in('id', userIds)
    : { data: [] as any[] };
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

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
    logins: (logins ?? []).filter((x: any) => x.lender_id === l.id).map((x: any) => {
      const p: any = x.user_id ? profileById.get(x.user_id) : null;
      return {
        id: x.id, email: x.email, full_name: x.full_name, user_id: x.user_id,
        invited_at: p?.invited_at ?? null, activated_at: p?.activated_at ?? null,
        last_seen_at: p?.last_seen_at ?? null, blocked: p ? p.active === false : false,
      };
    }),
  }));

  return (
    <div className="wrap" style={{ maxWidth: 1400 }}>
      <LenderManager lenders={rows} />
    </div>
  );
}
