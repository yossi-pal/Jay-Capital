import { type NextRequest } from 'next/server';
import { serverClient, serviceClient } from '@/lib/supabase-server';
import { statementPDF } from '@/lib/statement-pdf';
import { fetchStatementExtras } from '@/lib/statement-data';
import { logActivity } from '@/lib/activity';
import { firstOfMonth, clampMonth, defaultStatementMonth } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * The monthly (borrower) statement as a PDF, for a lender portal login.
 *
 * Access is decided first, AS THE SIGNED-IN USER: lender_loans() (migration
 * 026) only returns loans whose lender this login belongs to. Only once that
 * says yes are the statement's inputs read with the service role, so the PDF
 * is byte-for-byte the document the borrower gets. This is the same
 * check-then-read pattern fetchStatementExtras uses.
 */
export async function GET(req: NextRequest, { params }: { params: { loanId: string } }) {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Not signed in', { status: 401 });

  const { data: mine } = await supabase.rpc('lender_loans');
  const allowed = (mine ?? []).some((l: any) => l.loan_id === params.loanId);
  if (!allowed) return new Response('Not found', { status: 404 });

  const svc = serviceClient();
  const [{ data: loan }, { data: draws }] = await Promise.all([
    svc.from('loan_summary').select('*').eq('loan_id', params.loanId).maybeSingle(),
    svc.from('draw_details').select('*').eq('loan_id', params.loanId).order('draw_date', { ascending: true }),
  ]);
  if (!loan) return new Response('Not found', { status: 404 });

  const sp = new URL(req.url).searchParams;
  const monthParam = sp.get('month');
  const preview = sp.get('view') === '1';
  const requested = monthParam ? firstOfMonth(monthParam) : defaultStatementMonth();
  const statementDate = clampMonth(requested, loan.closing_date);

  const extras = await fetchStatementExtras(loan.loan_id);
  await logActivity('pdf_download', loan.loan_id, user.id,
    `Lender ${preview ? 'previewed' : 'downloaded'} statement ${statementDate} · ${loan.loan_number} · ${loan.property}`);

  const pdf = await statementPDF(loan, draws ?? [], statementDate, extras);
  const displayName = loan.is_entity && loan.entity_name ? loan.entity_name : loan.borrower_name;
  const safeName = `Statement_${String(displayName).replace(/[^a-z0-9]+/gi, '_')}_${statementDate}.pdf`;

  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename="${safeName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
