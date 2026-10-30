import { serverClient } from '@/lib/supabase-server';
import { payoffPDF } from '@/lib/payoff-pdf';
import { payoffFigures, STANDARD_WIRE, type PayoffFigures } from '@/lib/payoff';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * The saved payoff letter for a loan, as a PDF. Internal: staff and admins
 * only. Everything is read with the signed-in user's own client, so row level
 * security also refuses a borrower, on top of the role check here.
 */
export async function GET(_req: Request, { params }: { params: { loanId: string } }) {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Not signed in', { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'staff'].includes(profile.role)) return new Response('Not found', { status: 404 });

  const { data: loan } = await supabase.from('loan_summary').select('*').eq('loan_id', params.loanId).maybeSingle();
  if (!loan) return new Response('Not found', { status: 404 });
  const { data: letter } = await supabase.from('payoff_letters')
    .select('issued_on, through_date, interest_from, demand_prep_fee, wiring_fee, discharge_fee, draw_fee, late_fee, prepayment_pct, wire_instructions, figures')
    .eq('loan_id', loan.loan_id).maybeSingle();
  if (!letter) return new Response('No payoff letter for this loan yet', { status: 404 });
  // The amounts locked when the letter was saved, so a re-download is identical.
  let fig = letter.figures as PayoffFigures | null;
  if (!fig) {
    const [{ data: draws }, { data: payments }, { data: allocations }] = await Promise.all([
      supabase.from('draw_details').select('draw_date, amount, description').eq('loan_id', loan.loan_id),
      supabase.from('payments').select('id, payment_date, amount').eq('loan_id', loan.loan_id),
      supabase.from('payment_allocations').select('payment_id, period_month, amount').eq('loan_id', loan.loan_id),
    ]);
    fig = payoffFigures(loan, draws ?? [], payments ?? [], allocations ?? [], letter);
  }
  const pdf = await payoffPDF(loan, fig, letter.wire_instructions || STANDARD_WIRE, letter.issued_on);
  await logActivity('pdf_download', loan.loan_id, user.id, `Payoff Letter · ${loan.loan_number} · ${loan.property}`);

  const displayName = loan.is_entity && loan.entity_name ? loan.entity_name : loan.borrower_name;
  const safeName = `Payoff_Letter_${String(displayName).replace(/[^a-z0-9]+/gi, '_')}_${loan.loan_number}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
