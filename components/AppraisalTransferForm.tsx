'use client';

import { useState } from 'react';
import { downloadPdf } from '@/lib/download-pdf';

const BLANK = { borrowerName: '', propertyAddress: '', mortgageeClause: '' };

export default function AppraisalTransferForm() {
  const [form, setForm] = useState({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const set = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value })); setDone('');
  };

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.borrowerName.trim() || !form.propertyAddress.trim() || !form.mortgageeClause.trim()) {
      setErr('Please fill in all three fields.'); return;
    }
    setBusy(true); setErr(''); setDone('');
    try {
      const name = await downloadPdf('/api/documents/appraisal-transfer', form, 'Appraisal_Transfer_Letter.pdf');
      setDone(`Downloaded ${name}.`);
    } catch (e: any) {
      setErr(e?.message || 'Could not create the letter.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={generate} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="field-wrap">
        <label htmlFor="at-borrower">Borrower name(s) *</label>
        <input id="at-borrower" className="field" value={form.borrowerName} onChange={set('borrowerName')}
          maxLength={200} placeholder="e.g. John Smith" autoComplete="off" />
      </div>
      <div className="field-wrap">
        <label htmlFor="at-property">Subject property address *</label>
        <input id="at-property" className="field" value={form.propertyAddress} onChange={set('propertyAddress')}
          maxLength={300} placeholder="e.g. 123 Main Street, Brooklyn, NY 11201" autoComplete="off" />
      </div>
      <div className="field-wrap">
        <label htmlFor="at-clause">New mortgagee clause *</label>
        <textarea id="at-clause" className="field" rows={4} value={form.mortgageeClause} onChange={set('mortgageeClause')}
          maxLength={600}
          placeholder={'e.g. ABC Mortgage, LLC ISAOA\n456 Lender Avenue, Suite 100, New York, NY 10001'} />
        <p className="muted hint" style={{ margin: '2px 0 0' }}>
          Exactly as the new lender gave it. Each line here becomes a line on the letter.
        </p>
      </div>
      {err && <div className="alert error" role="alert" style={{ margin: 0 }}>{err}</div>}
      {done && <div className="alert info" role="status" style={{ margin: 0 }}>{done}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Download letter (PDF)'}</button>
        <button className="btn secondary" type="button" disabled={busy}
          onClick={() => { setForm({ ...BLANK }); setErr(''); setDone(''); }}>Clear</button>
      </div>
    </form>
  );
}
