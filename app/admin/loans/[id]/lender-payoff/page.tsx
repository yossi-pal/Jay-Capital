import { serverClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import LenderPayoffStatement from '@/components/LenderPayoffStatement';

export const dynamic = 'force-dynamic';

export default async function LenderPayoffPage({ params }: { params: { id: string } }) {
  const supabase = serverClient();
  const { data: loan } = await supabase.from('loan_summary').select('*').eq('loan_id', params.id).single();
  if (!loan) notFound();
  // Staff and admins only (row level security); never borrowers.
  const [{ data: payoff }, { data: letter }, { data: draws }, { data: payments }, { data: allocations }] = await Promise.all([
    supabase.from('loan_payoffs').select('payoff_date, amount_received, late_fee, discharge_fee, figures, updated_at')
      .eq('loan_id', params.id).maybeSingle(),
    supabase.from('payoff_letters').select('figures').eq('loan_id', params.id).maybeSingle(),
    supabase.from('draw_details').select('draw_date, amount, description').eq('loan_id', params.id),
    supabase.from('payments').select('id, payment_date, amount').eq('loan_id', params.id),
    supabase.from('payment_allocations').select('payment_id, period_month, amount').eq('loan_id', params.id),
  ]);
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  const q = letter?.figures as any;
  return (
    <LenderPayoffStatement
      loan={loan} payoff={payoff ?? null} canEdit={profile?.role === 'admin'}
      draws={draws ?? []} payments={payments ?? []} allocations={allocations ?? []}
      quote={q ? { total: q.total, through: q.through, perDiem: q.perDiem } : null}
    />
  );
}
