import { serverClient } from '@/lib/supabase-server';
import { lenderPayoffPDF } from '@/lib/lender-payoff-pdf';
import type { LenderPayoffFigures } from '@/lib/payoff';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * A paid-off loan's Lender Payoff Statement as a PDF, from the amounts locked
 * when the payoff was recorded. Internal: staff and admins only, read with
 * the signed-in user's own client so row level security also refuses a
 * borrower, on top of the role check here.
 */
export async function GET(_req: Request, { params }: { params: { loanId: string } }) {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Not signed in', { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'staff'].includes(profile.role)) return new Response('Not found', { status: 404 });

  const { data: loan } = await supabase.from('loan_summary').select('*').eq('loan_id', params.loanId).maybeSingle();
  if (!loan) return new Response('Not found', { status: 404 });
  const { data: payoff } = await supabase.from('loan_payoffs').select('figures').eq('loan_id', loan.loan_id).maybeSingle();
  if (!payoff) return new Response('This loan has no recorded payoff yet', { status: 404 });

  const pdf = await lenderPayoffPDF(loan, payoff.figures as LenderPayoffFigures);
  await logActivity('pdf_download', loan.loan_id, user.id, `Lender Payoff Statement · ${loan.loan_number} · ${loan.property}`);

  const displayName = loan.is_entity && loan.entity_name ? loan.entity_name : loan.borrower_name;
  const safeName = `Lender_Payoff_Statement_${String(displayName).replace(/[^a-z0-9]+/gi, '_')}_${loan.loan_number}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
