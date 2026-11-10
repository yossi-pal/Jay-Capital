import { serverClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { getMe } from '@/lib/session';
import LoanDetail from '@/components/LoanDetail';
import { DRAW_REQUEST_COLUMNS, type DrawRequestRow } from '@/lib/draw-requests';

export const dynamic = 'force-dynamic';

export default async function LoanPage({ params }: { params: { id: string } }) {
  const supabase = serverClient();
  // All at once rather than one after another: each read is a round trip to
  // Supabase, and in sequence they added up to most of the page's load time.
  // Every read runs as the signed-in user, so row level security still decides
  // what comes back.
  const [
    { data: summary }, { data: draws }, { data: payments }, { data: allocations },
    { data: allLoans }, { data: position }, { data: closingStatement },
    { data: payoffLetter }, { data: loanPayoff }, { profile }, { data: drawRequests },
  ] = await Promise.all([
    supabase.from('loan_summary').select('*').eq('loan_id', params.id).single(),
    supabase.from('draw_details').select('*').eq('loan_id', params.id).order('draw_date', { ascending: true }),
    supabase.from('payments')
      .select('id, payment_date, amount, method, note').eq('loan_id', params.id).order('payment_date', { ascending: true }),
    supabase.from('payment_allocations')
      .select('payment_id, period_month, amount').eq('loan_id', params.id),
    // Fallback ordering for Prev/Next when the dashboard's own order isn't in
    // this browser (direct link, or a fresh session).
    supabase.from('loan_summary').select('loan_id, loan_number, borrower_name').order('loan_number'),
    // Staff/admin only (row level security); this page is never shown to borrowers.
    supabase.from('loan_positions').select('lien_position').eq('loan_id', params.id).maybeSingle(),
    supabase.from('closing_statements').select('id').eq('loan_id', params.id).maybeSingle(),
    supabase.from('payoff_letters').select('late_fee, discharge_fee, figures').eq('loan_id', params.id).maybeSingle(),
    supabase.from('loan_payoffs').select('amount_received, late_fee, discharge_fee, figures').eq('loan_id', params.id).maybeSingle(),
    getMe(),
    supabase.from('draw_requests').select(DRAW_REQUEST_COLUMNS).eq('loan_id', params.id)
      .order('requested_at', { ascending: true }),
  ]);
  if (!summary) notFound();
  const fallbackOrder = (allLoans ?? []).map((l: any) => ({
    id: l.loan_id, label: `${l.loan_number} · ${l.borrower_name}`,
  }));
  const quoted = payoffLetter?.figures as any;
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
      drawRequests={(drawRequests ?? []) as DrawRequestRow[]}
    />
  );
}
