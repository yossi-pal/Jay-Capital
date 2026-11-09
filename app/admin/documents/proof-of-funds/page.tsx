import Link from 'next/link';
import { getMe } from '@/lib/session';
import ProofOfFundsForm from '@/components/ProofOfFundsForm';

export const dynamic = 'force-dynamic';

export default async function ProofOfFundsPage() {
  const { profile: me } = await getMe();
  if (me?.role !== 'admin' && me?.role !== 'staff') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin or staff only.</div></div></div>;
  }
  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <Link href="/admin/documents" className="muted" style={{ fontSize: 13, textDecoration: 'none' }}>&larr; Documents</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div className="grow">
          <h1>Proof of Funds</h1>
          <div className="sub">Dated today and closed with Joel Brull&rsquo;s name (no signature). The PDF downloads straight away and is not saved.</div>
        </div>
      </div>
      <ProofOfFundsForm />
    </div>
  );
}
