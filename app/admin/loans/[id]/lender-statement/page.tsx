import { serverClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import LenderStatement from '@/components/LenderStatement';

export const dynamic = 'force-dynamic';

export default async function LenderStatementPage({ params }: { params: { id: string } }) {
  const supabase = serverClient();
  const { data: loan } = await supabase.from('loan_summary').select('*').eq('loan_id', params.id).single();
  if (!loan) notFound();
  // Readable by staff and admins only (row level security); never borrowers.
  const { data: statement } = await supabase.from('lender_statements')
    .select('lender_points_pct, reserves, notes, updated_at').eq('loan_id', params.id).maybeSingle();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  return <LenderStatement loan={loan} statement={statement ?? null} canEdit={profile?.role === 'admin'} />;
}
