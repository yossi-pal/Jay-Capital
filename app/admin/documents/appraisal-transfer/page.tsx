import Link from 'next/link';
import { serverClient } from '@/lib/supabase-server';
import { getMe } from '@/lib/session';
import AppraisalTransferForm from '@/components/AppraisalTransferForm';

export const dynamic = 'force-dynamic';

export default async function AppraisalTransferPage() {
  const { profile: me } = await getMe();
  if (me?.role !== 'admin' && me?.role !== 'staff') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin or staff only.</div></div></div>;
  }
  const { data: loans } = await serverClient().from('loan_summary')
    .select('loan_id, loan_number, property, borrower_name, status')
    .order('loan_number', { ascending: false });

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <Link href="/admin/documents" className="muted" style={{ fontSize: 13, textDecoration: 'none' }}>&larr; Documents</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div className="grow">
          <h1>Appraisal Transfer Letter</h1>
          <div className="sub">Dated today and signed by Solomon Grunhut, Vice President. The PDF downloads straight away and is not saved.</div>
        </div>
      </div>
      <AppraisalTransferForm loans={(loans ?? []).map((l: any) => ({
        id: l.loan_id, number: l.loan_number, property: l.property ?? '', borrower: l.borrower_name ?? '', status: l.status,
      }))} />
    </div>
  );
}
