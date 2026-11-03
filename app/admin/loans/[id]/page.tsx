import { serverClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import LoanDetail from '@/components/LoanDetail';

export const dynamic = 'force-dynamic';

export default async function LoanPage({ params }: { params: { id: string } }) {
  const supabase = serverClient();
  const { data: summary } = await supabase.from('loan_summary').select('*').eq('loan_id', params.id).single();
  if (!summary) notFound();
  const { data: draws } = await supabase.from('draw_details').select('*').eq('loan_id', params.id).order('draw_date', { ascending: true });
  const { data: payments } = await supabase.from('payments')
    .select('id, payment_date, amount, method, note').eq('loan_id', params.id).order('payment_date', { ascending: true });
  const { data: allocations } = await supabase.from('payment_allocations')
    .select('payment_id, period_month, amount').eq('loan_id', params.id);

  // Fallback ordering for Prev/Next when the dashboard's own order isn't in
  // this browser (direct link, or a fresh session).
  const { data: allLoans } = await supabase
    .from('loan_summary').select('loan_id, loan_number, borrower_name').order('loan_number');
  const fallbackOrder = (allLoans ?? []).map((l: any) => ({
    id: l.loan_id, label: `${l.loan_number} · ${l.borrower_name}`,
  }));
  // Staff/admin only (row level security); this page is never shown to borrowers.
  const { data: position } = await supabase.from('loan_positions')
    .select('lien_position').eq('loan_id', params.id).maybeSingle();
  const { data: closingStatement } = await supabase.from('closing_statements')
    .select('id').eq('loan_id', params.id).maybeSingle();
  const { data: payoffLetter } = await supabase.from('payoff_letters')
    .select('late_fee, discharge_fee, figures').eq('loan_id', params.id).maybeSingle();
  const { data: loanPayoff } = await supabase.from('loan_payoffs')
    .select('amount_received, late_fee, discharge_fee, figures').eq('loan_id', params.id).maybeSingle();
  const quoted = payoffLetter?.figures as any;
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  const role = profile?.role;
  return (
    <LoanDetail
      summary={summary}
      draws={draws ?? []}
      payments={payments ?? []}
      allocations={allocations ?? []}
      fallbackOrder={fallbackOrder}
      canEdit={role === 'admin'}
      canSend={role === 'admin' || role === 'staff'}
      hasClosingStatement={!!closingStatement}
      hasPayoffLetter={!!payoffLetter}
      payoffQuote={quoted ? { total: quoted.total, through: quoted.through, perDiem: quoted.perDiem } : null}
      payoffDefaults={payoffLetter ? { lateFee: Number(payoffLetter.late_fee), dischargeFee: Number(payoffLetter.discharge_fee) } : null}
      loanPayoff={loanPayoff ? {
        amount_received: Number(loanPayoff.amount_received), late_fee: Number(loanPayoff.late_fee),
        discharge_fee: Number(loanPayoff.discharge_fee), difference: (loanPayoff.figures as any)?.difference ?? null,
      } : null}
      lienPosition={position?.lien_position ?? null}
    />
  );
}
