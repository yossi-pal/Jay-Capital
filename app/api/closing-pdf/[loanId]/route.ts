import { type NextRequest } from 'next/server';
import { serverClient } from '@/lib/supabase-server';
import { closingPDF } from '@/lib/closing-pdf';
import { closingFigures } from '@/lib/closing-statement';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * Closing Statement (?doc=closing, the default) or Lender Statement
 * (?doc=lender) as a PDF. Internal: staff and admins only. Everything is read
 * with the signed-in user's own client, so row level security also refuses a
 * borrower, on top of the role check here.
 */
export async function GET(req: NextRequest, { params }: { params: { loanId: string } }) {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Not signed in', { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'staff'].includes(profile.role)) return new Response('Not found', { status: 404 });

  const { data: loan } = await supabase
    .from('loan_summary').select('*').eq('loan_id', params.loanId).maybeSingle();
  if (!loan) return new Response('Not found', { status: 404 });
  const { data: cs } = await supabase.from('closing_statements')
    .select('lender_points_pct, interest_reserve_months, broker_fee_pct, processing_fee, legal_fee, other_fees, notes, lender_notes')
    .eq('loan_id', loan.loan_id).maybeSingle();
  if (!cs) return new Response('No closing statement for this loan yet', { status: 404 });

  const kind = new URL(req.url).searchParams.get('doc') === 'lender' ? 'lender' : 'closing';
  const { data: position } = await supabase.from('loan_positions')
    .select('lien_position').eq('loan_id', loan.loan_id).maybeSingle();
  const fig = closingFigures({ ...loan, ...cs });
  const pdf = await closingPDF(kind, { ...loan, lien_position: position?.lien_position ?? null }, fig, kind === 'lender' ? cs.lender_notes : cs.notes);

  const label = kind === 'lender' ? 'Lender Statement' : 'Closing Statement';
  await logActivity('pdf_download', loan.loan_id, user.id, `${label} · ${loan.loan_number} · ${loan.property}`);

  const displayName = loan.is_entity && loan.entity_name ? loan.entity_name : loan.borrower_name;
  const safeName = `${label.replace(' ', '_')}_${String(displayName).replace(/[^a-z0-9]+/gi, '_')}_${loan.loan_number}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
