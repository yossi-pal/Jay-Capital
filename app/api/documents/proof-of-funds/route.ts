import { serverClient } from '@/lib/supabase-server';
import { proofOfFundsPDF, LetterTooLongError } from '@/lib/proof-of-funds-pdf';
import { todayInAppTz } from '@/lib/format';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/** "$400,000" for whole dollars, "$400,000.50" when there are cents. */
function priceText(raw: string): string | null {
  const n = Number(raw.replace(/[^0-9.]/g, ''));
  if (!raw.trim() || !isFinite(n) || n <= 0) return null;
  const whole = Math.round(n * 100) % 100 === 0;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/**
 * Builds a Proof of Funds letter from the typed-in details and sends it
 * straight back as a PDF. Nothing is saved. Staff and admins only.
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
  const property = String(body?.property ?? '').trim();
  const priceRaw = String(body?.purchasePrice ?? '').trim();
  if (!borrowerName || !property || !priceRaw) {
    return Response.json({ error: 'Please fill in the borrower name, property and purchase price.' }, { status: 400 });
  }
  const purchasePrice = priceText(priceRaw);
  if (!purchasePrice) return Response.json({ error: 'Please enter the purchase price as an amount, e.g. $400,000.' }, { status: 400 });
  if (borrowerName.length > 200 || property.length > 300) {
    return Response.json({ error: 'One of the fields is too long to fit on the letter. Please shorten it.' }, { status: 400 });
  }

  try {
    // Written the way the original letter dates itself, e.g. "Nov 09, 2026".
    const date = todayInAppTz().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    const pdf = await proofOfFundsPDF({ borrowerName, property, purchasePrice, date });
    await logActivity('pdf_download', null, user.id, `Proof of Funds · ${borrowerName} · ${purchasePrice}`);
    const safeName = `Proof_of_Funds_${borrowerName.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}.pdf`;
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
