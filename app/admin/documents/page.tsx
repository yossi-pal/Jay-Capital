import Link from 'next/link';
import { getMe } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Company letters staff can fill in and download. New ones get a card here. */
const DOCUMENTS = [
  {
    href: '/admin/documents/appraisal-transfer',
    title: 'Appraisal Transfer Letter',
    blurb: 'Release an appraisal to a new lender. Enter the borrower, property and the new mortgagee clause, and download a signed PDF.',
  },
  {
    href: '/admin/documents/proof-of-funds',
    title: 'Proof of Funds',
    blurb: 'Confirm funds are available for a purchase. Enter the borrower, property and purchase price, and download the letter.',
  },
];

export default async function DocumentsPage() {
  const { profile: me } = await getMe();
  if (me?.role !== 'admin' && me?.role !== 'staff') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin or staff only.</div></div></div>;
  }
  return (
    <div className="wrap" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div className="grow">
          <h1>Documents</h1>
          <div className="sub">Fill in a few details and download a ready-to-send letter. Nothing is saved.</div>
        </div>
      </div>
      <div className="doc-grid">
        {DOCUMENTS.map(d => (
          <Link key={d.href} href={d.href} className="card doc-card">
            <span className="doc-ico" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>
            </span>
            <b>{d.title}</b>
            <span className="muted">{d.blurb}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
