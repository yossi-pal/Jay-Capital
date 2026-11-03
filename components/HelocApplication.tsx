'use client';

import { useState } from 'react';
import AddressFields, { EMPTY_ADDRESS, formatAddress, type AddressValue } from '@/components/AddressFields';
import { submitHelocApplication } from '@/lib/heloc';

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * Currency as they type, cents allowed.
 *
 * Keeps a trailing "." and a lone "0" after it, so typing 1234.05 is not
 * fought character by character -- stripping either would make the decimal
 * point impossible to enter.
 */
function formatMoney(raw: string): string {
  let v = raw.replace(/[^\d.]/g, '');
  const dot = v.indexOf('.');
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');

  let [int = '', dec] = v.split('.');
  int = int.slice(0, 12).replace(/^0+(?=\d)/, '');
  if (dec !== undefined) dec = dec.slice(0, 2);

  if (!int && dec === undefined) return '';
  const grouped = int ? Number(int).toLocaleString('en-US') : '0';
  return '$' + grouped + (dec !== undefined ? '.' + dec : '');
}

const USES = [
  { value: 'primary', label: 'Primary Home' },
  { value: 'secondary', label: 'Secondary Home' },
  { value: 'investment', label: 'Investment Property' },
];

export default function HelocApplication() {
  const [f, setF] = useState({
    firstName: '', lastName: '', email: '', phone: '', dob: '',
    propertyUse: '',
    propertyValue: '', mortgageBalance: '', monthlyPayment: '', annualIncome: '',
    notes: '', website: '',
  });
  const [propertyAddress, setPropertyAddress] = useState<AddressValue>({ ...EMPTY_ADDRESS });
  const [primaryAddress, setPrimaryAddress] = useState<AddressValue>({ ...EMPTY_ADDRESS });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const set = (k: keyof typeof f) => (v: string) => setF(p => ({ ...p, [k]: v }));
  const needsPrimary = !!f.propertyUse && f.propertyUse !== 'primary';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = await submitHelocApplication({
      ...f,
      propertyAddress: formatAddress(propertyAddress),
      primaryAddress: needsPrimary ? formatAddress(primaryAddress) : '',
      propertyAddressParts: propertyAddress,
      primaryAddressParts: needsPrimary ? primaryAddress : undefined,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not submit your application.'); return; }
    setDone(res.message || 'Thank you — your application has been received.');
  }

  if (done) {
    return (
      <div className="lp-form lp-form-done">
        <div className="lp-eyebrow">Application received</div>
        <p style={{ margin: '10px 0 0', color: '#4A5568' }}>{done}</p>
        <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
          A member of the team will reach out to confirm the details and next steps.
        </p>
      </div>
    );
  }

  return (
    <form className="lp-form hx-form" onSubmit={submit}>
      <div className="lp-form-grid">
        <label className="lp-field">
          <span>First name</span>
          <input value={f.firstName} onChange={e => set('firstName')(e.target.value)} required autoComplete="given-name" />
        </label>
        <label className="lp-field">
          <span>Last name</span>
          <input value={f.lastName} onChange={e => set('lastName')(e.target.value)} required autoComplete="family-name" />
        </label>
        <label className="lp-field">
          <span>Email address</span>
          <input type="email" value={f.email} onChange={e => set('email')(e.target.value)} required autoComplete="email" />
        </label>
        <label className="lp-field">
          <span>Phone number</span>
          <input type="tel" inputMode="tel" value={f.phone}
            onChange={e => set('phone')(formatPhone(e.target.value))}
            placeholder="(555) 123-4567" required autoComplete="tel" />
        </label>
        <label className="lp-field">
          <span>Date of birth</span>
          <input type="date" value={f.dob} onChange={e => set('dob')(e.target.value)} required />
        </label>
      </div>

      <AddressFields legend="Subject property address" required section="property"
        value={propertyAddress} onChange={setPropertyAddress} />

      <div className="lp-form-grid">
        <label className="lp-field">
          <span>Property use</span>
          <select value={f.propertyUse} onChange={e => set('propertyUse')(e.target.value)} required>
            <option value="">Select…</option>
            {USES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </label>
        <label className="lp-field">
          <span>Estimated current property value</span>
          <input inputMode="numeric" value={f.propertyValue}
            onChange={e => set('propertyValue')(formatMoney(e.target.value))} placeholder="$0" required />
        </label>
      </div>

      {needsPrimary && (
        <AddressFields legend="Your primary address" required section="primary"
          value={primaryAddress} onChange={setPrimaryAddress} />
      )}

      <div className="lp-form-grid">
        <label className="lp-field">
          <span>Approximate outstanding mortgage balance</span>
          <input inputMode="numeric" value={f.mortgageBalance}
            onChange={e => set('mortgageBalance')(formatMoney(e.target.value))} placeholder="$0" required />
        </label>
        <label className="lp-field">
          <span>Approximate current monthly payment</span>
          <input inputMode="numeric" value={f.monthlyPayment}
            onChange={e => set('monthlyPayment')(formatMoney(e.target.value))} placeholder="$0" required />
        </label>
      </div>

      <label className="lp-field">
        <span>Approximate annual income</span>
        <input inputMode="numeric" value={f.annualIncome}
          onChange={e => set('annualIncome')(formatMoney(e.target.value))} placeholder="$0" required />
      </label>

      <label className="lp-field">
        <span>Additional notes <em>optional</em></span>
        <textarea rows={3} value={f.notes} onChange={e => set('notes')(e.target.value)}
          placeholder="Anything else we should know." />
      </label>

      {/* honeypot: off-screen, not hidden, so bots still fill it */}
      <input tabIndex={-1} autoComplete="off" aria-hidden="true"
        value={f.website} onChange={e => set('website')(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />

      {err && <div className="lp-form-err">{err}</div>}

      <button className="hx-btn" type="submit" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit application'}
      </button>

      <p className="lp-form-note">
        Sent securely to Jay Capital Funding and used only to process this application.
      </p>
    </form>
  );
}
