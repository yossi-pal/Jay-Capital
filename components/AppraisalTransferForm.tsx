'use client';

import { useState } from 'react';

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
      const res = await fetch('/api/documents/appraisal-transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Could not create the letter (error ${res.status}).`);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'Appraisal_Transfer_Letter.pdf';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
          maxLength={200} placeholder="e.g. David Spitzer" autoComplete="off" />
      </div>
      <div className="field-wrap">
        <label htmlFor="at-property">Subject property address *</label>
        <input id="at-property" className="field" value={form.propertyAddress} onChange={set('propertyAddress')}
          maxLength={300} placeholder="e.g. 796 Bedford Ave, Brooklyn, NY 11205" autoComplete="off" />
      </div>
      <div className="field-wrap">
        <label htmlFor="at-clause">New mortgagee clause *</label>
        <textarea id="at-clause" className="field" rows={4} value={form.mortgageeClause} onChange={set('mortgageeClause')}
          maxLength={600}
          placeholder={'Hometown Equity Mortgage, LLC dba the Lender ISAOA\n25531 Commercentre Dr #250, Lake Forest, CA 92630'} />
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
