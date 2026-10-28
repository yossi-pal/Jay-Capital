import { serverClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import ClosingStatement from '@/components/ClosingStatement';

export const dynamic = 'force-dynamic';

export default async function ClosingStatementPage({ params, searchParams }: {
  params: { id: string }; searchParams: { view?: string };
}) {
  const supabase = serverClient();
  const { data: loan } = await supabase.from('loan_summary').select('*').eq('loan_id', params.id).single();
  if (!loan) notFound();
  // Readable by staff and admins only (row level security); never borrowers.
  const { data: statement } = await supabase.from('closing_statements')
    .select('lender_points_pct, interest_reserve_months, broker_fee_pct, processing_fee, legal_fee, other_fees, notes, updated_at')
    .eq('loan_id', params.id).maybeSingle();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  return (
    <ClosingStatement
      loan={loan} statement={statement ?? null} canEdit={profile?.role === 'admin'}
      initialView={searchParams.view === 'lender' ? 'lender' : 'closing'}
    />
  );
}
