import { serverClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { getMe } from '@/lib/session';
import ClosingStatement from '@/components/ClosingStatement';

export const dynamic = 'force-dynamic';

export default async function ClosingStatementPage({ params, searchParams }: {
  params: { id: string }; searchParams: { view?: string };
}) {
  const supabase = serverClient();
  const [{ data: loan }, { data: statement }, { data: position }, { profile }] = await Promise.all([
    supabase.from('loan_summary').select('*').eq('loan_id', params.id).single(),
    // Readable by staff and admins only (row level security); never borrowers.
    supabase.from('closing_statements')
      .select('lender_points_pct, interest_reserve_months, broker_fee_pct, processing_fee, legal_fee, other_fees, notes, lender_notes, updated_at')
      .eq('loan_id', params.id).maybeSingle(),
    supabase.from('loan_positions').select('lien_position').eq('loan_id', params.id).maybeSingle(),
    getMe(),
  ]);
  if (!loan) notFound();
  return (
    <ClosingStatement
      loan={{ ...loan, lien_position: position?.lien_position ?? null }} statement={statement ?? null} canEdit={profile?.role === 'admin'}
      initialView={searchParams.view === 'lender' ? 'lender' : 'closing'}
    />
  );
}
