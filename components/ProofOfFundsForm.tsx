'use client';

import { useState } from 'react';
import { downloadPdf } from '@/lib/download-pdf';

const BLANK = { borrowerName: '', property: '', purchasePrice: '' };

/** "$400,000" as you type: digits with commas, cents kept if entered. */
function formatPrice(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return '';
  const [whole, ...rest] = cleaned.split('.');
  const cents = rest.length ? '.' + rest.join('').slice(0, 2) : '';
  return '$' + (whole ? Number(whole).toLocaleString('en-US') : '0') + cents;
}

export default function ProofOfFundsForm() {
  const [form, setForm] = useState({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const set = (k: keyof typeof BLANK, fmt?: (v: string) => string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = fmt ? fmt(e.target.value) : e.target.value;
      setForm(f => ({ ...f, [k]: v })); setDone('');
    };

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.borrowerName.trim() || !form.property.trim() || !form.purchasePrice.trim()) {
      setErr('Please fill in all three fields.'); return;
    }
    setBusy(true); setErr(''); setDone('');
    try {
      const name = await downloadPdf('/api/documents/proof-of-funds', form, 'Proof_of_Funds.pdf');
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
        <label htmlFor="pof-borrower">Borrower name *</label>
        <input id="pof-borrower" className="field" value={form.borrowerName} onChange={set('borrowerName')}
          maxLength={200} placeholder="e.g. John Smith" autoComplete="off" />
      </div>
      <div className="field-wrap">
        <label htmlFor="pof-property">Property *</label>
        <input id="pof-property" className="field" value={form.property} onChange={set('property')}
          maxLength={300} placeholder="e.g. 123 Main Street, Brooklyn, NY 11201" autoComplete="off" />
        <p className="muted hint" style={{ margin: '2px 0 0' }}>
          Type TBD if the property hasn&rsquo;t been chosen yet.
        </p>
      </div>
      <div className="field-wrap">
        <label htmlFor="pof-price">Purchase price *</label>
        <input id="pof-price" className="field" value={form.purchasePrice} onChange={set('purchasePrice', formatPrice)}
          inputMode="decimal" maxLength={20} placeholder="e.g. $400,000" autoComplete="off" />
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
