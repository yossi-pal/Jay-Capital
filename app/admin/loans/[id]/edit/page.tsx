import { serverClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { getMe } from '@/lib/session';
import EditLoanForm from '@/components/EditLoanForm';

export const dynamic = 'force-dynamic';

export default async function EditLoanPage({ params }: { params: { id: string } }) {
  const supabase = serverClient();
  // Read together; every read is under row level security, and nothing is
  // shown until the admin check below passes.
  const [{ profile: me }, { data: loan }, { data: lenders }, { data: position }] = await Promise.all([
    getMe(),
    supabase.from('loan_summary').select('*').eq('loan_id', params.id).single(),
    supabase.from('lenders').select('id, name, active').order('name'),
    supabase.from('loan_positions').select('lien_position').eq('loan_id', params.id).maybeSingle(),
  ]);
  if (me?.role !== 'admin') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin only.</div></div></div>;
  }
  if (!loan) notFound();
  // Admin-only table (row level security), read after the admin check.
  const { data: wire } = await supabase.from('borrower_wires')
    .select('instructions').eq('borrower_id', loan.borrower_id).maybeSingle();
  return (
    <EditLoanForm
      loan={{ ...loan, lien_position: position?.lien_position ?? null, borrower_wire: wire?.instructions ?? '' }}
      lenders={lenders ?? []}
    />
  );
}
