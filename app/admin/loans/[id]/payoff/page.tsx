import { serverClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import PayoffLetter from '@/components/PayoffLetter';

export const dynamic = 'force-dynamic';

export default async function PayoffPage({ params }: { params: { id: string } }) {
  const supabase = serverClient();
  const { data: loan } = await supabase.from('loan_summary').select('*').eq('loan_id', params.id).single();
  if (!loan) notFound();
  const [{ data: draws }, { data: payments }, { data: allocations }, { data: letter }] = await Promise.all([
    supabase.from('draw_details').select('draw_date, amount, description').eq('loan_id', params.id).order('draw_date'),
    supabase.from('payments').select('id, payment_date, amount').eq('loan_id', params.id),
    supabase.from('payment_allocations').select('payment_id, period_month, amount').eq('loan_id', params.id),
    // Readable by staff and admins only (row level security); never borrowers.
    supabase.from('payoff_letters')
      .select('issued_on, through_date, interest_from, demand_prep_fee, wiring_fee, discharge_fee, draw_fee, late_fee, prepayment_pct, wire_instructions, updated_at')
      .eq('loan_id', params.id).maybeSingle(),
  ]);
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  return (
    <PayoffLetter
      loan={loan} draws={draws ?? []} payments={payments ?? []} allocations={allocations ?? []}
      letter={letter ?? null} canEdit={profile?.role === 'admin'}
    />
  );
}
