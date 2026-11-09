import { serverClient } from '@/lib/supabase-server';
import { appraisalTransferPDF, LetterTooLongError } from '@/lib/appraisal-transfer-pdf';
import { todayInAppTz, fmtDate } from '@/lib/format';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const LIMITS = { borrowerName: 200, propertyAddress: 300, mortgageeClause: 600 };

/**
 * Builds an Appraisal Transfer Letter from the three typed-in details and
 * sends it straight back as a PDF. Nothing is saved. Staff and admins only.
 */
export async function POST(req: Request) {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'You are signed out. Please sign in again.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'staff'].includes(profile.role)) {
    return Response.json({ error: 'Only staff can create documents.' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = null; }
  const borrowerName = String(body?.borrowerName ?? '').trim();
  const propertyAddress = String(body?.propertyAddress ?? '').trim();
  const mortgageeClause = String(body?.mortgageeClause ?? '').trim();
  if (!borrowerName || !propertyAddress || !mortgageeClause) {
    return Response.json({ error: 'Please fill in the borrower name, property address and mortgagee clause.' }, { status: 400 });
  }
  if (borrowerName.length > LIMITS.borrowerName || propertyAddress.length > LIMITS.propertyAddress
    || mortgageeClause.length > LIMITS.mortgageeClause || mortgageeClause.split(/\r?\n/).length > 8) {
    return Response.json({ error: 'One of the fields is too long to fit on the letter. Please shorten it.' }, { status: 400 });
  }

  try {
    const pdf = await appraisalTransferPDF({
      borrowerName, propertyAddress, mortgageeClause, date: fmtDate(todayInAppTz()),
    });
    await logActivity('pdf_download', null, user.id, `Appraisal Transfer Letter · ${propertyAddress}`);
    const safeName = `Appraisal_Transfer_${borrowerName.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}.pdf`;
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    if (e instanceof LetterTooLongError) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: `Could not create the letter: ${e?.message || e}` }, { status: 500 });
  }
}
