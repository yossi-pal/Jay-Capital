'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrokerageLoan, updateBrokerageLoan, deleteBrokerageLoan } from '@/lib/brokerage-actions';
import { Modal, ConfirmDialog } from '@/components/Modal';
import { money, fmtDate } from '@/lib/format';
import { formatAddress } from '@/lib/formatting';

export interface BrokerageRow {
  id: string; property: string; loan_amount: number | string; closing_date: string; borrower_name: string | null;
  lender: string | null;
}

const BLANK = { property: '', loanAmount: '', closingDate: '', borrowerName: '', lender: '' };

export default function BrokerageManager({ rows, canEdit }: { rows: BrokerageRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [form, setForm] = useState({ ...BLANK });
  // null = closed, 'new' = adding, a row = editing that row
  const [editing, setEditing] = useState<BrokerageRow | 'new' | null>(null);
  const [confirmDel, setConfirmDel] = useState<BrokerageRow | null>(null);
  const [q, setQ] = useState('');
  // Closing-date range; dates are compared as YYYY-MM-DD text, so no time zone shifts.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const view = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r =>
      (!s || `${r.borrower_name ?? ''} ${r.property} ${r.lender ?? ''}`.toLowerCase().includes(s))
      && (!from || r.closing_date >= from)
      && (!to || r.closing_date <= to));
  }, [rows, q, from, to]);
  const filtered = !!(q.trim() || from || to);
  const total = view.reduce((sum, r) => sum + Number(r.loan_amount || 0), 0);

  function openNew() { setErr(''); setForm({ ...BLANK }); setEditing('new'); }
  function openEdit(r: BrokerageRow) {
    setErr('');
    setForm({ property: r.property, loanAmount: String(r.loan_amount), closingDate: r.closing_date, borrowerName: r.borrower_name ?? '', lender: r.lender ?? '' });
    setEditing(r);
  }

  async function save() {
    setBusy(true); setErr('');
    const res = editing === 'new' || !editing
      ? await createBrokerageLoan(form)
      : await updateBrokerageLoan(editing.id, form);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not save the loan.'); return; }
    setEditing(null); setNote(res.message || 'Saved.');
    router.refresh();
  }

  async function remove() {
    if (!confirmDel) return;
    setBusy(true);
    const res = await deleteBrokerageLoan(confirmDel.id);
    setBusy(false); setConfirmDel(null);
    if (!res.ok) { setNote(''); setErr(res.error || 'Could not delete the loan.'); return; }
    setErr(''); setNote(res.message || 'Deleted.');
    router.refresh();
  }

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Brokerage</h1>
          <div className="sub">Deals brokered and funded outside this system. Kept here for reference only.</div>
        </div>
        {canEdit && <button className="btn" onClick={openNew}>+ Add loan</button>}
      </div>

      {note && <div className="alert info" style={{ marginBottom: 16 }}>{note}</div>}
      {err && !editing && <div className="alert error" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: 16 }}>
          <input className="field" style={{ flex: '1 1 240px', maxWidth: 360 }} placeholder="Search borrower, address or lender"
            value={q} onChange={e => setQ(e.target.value)} aria-label="Search brokerage loans" />
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            Closed from
            <input className="field" type="date" value={from} max={to || undefined}
              onChange={e => setFrom(e.target.value)} style={{ width: 'auto' }} />
          </label>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            to
            <input className="field" type="date" value={to} min={from || undefined}
              onChange={e => setTo(e.target.value)} style={{ width: 'auto' }} />
          </label>
          {filtered && (
            <button className="btn secondary sm" onClick={() => { setQ(''); setFrom(''); setTo(''); }}>Clear</button>
          )}
          <span className="muted" style={{ fontSize: 14 }}>
            <b style={{ color: 'var(--ink)' }}>{view.length}</b> {view.length === 1 ? 'loan' : 'loans'} ·{' '}
            <b style={{ color: 'var(--ink)' }}>{money(total)}</b> total
          </span>
        </div>

        {view.length > 0 && (
          <div className="tablescroll loanlist">
            <table style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Property</th>
                  <th className="num">Loan amount</th>
                  <th>Closing date</th>
                  <th>Lender</th>
                  {canEdit && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {view.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.borrower_name || <span className="muted" style={{ fontWeight: 400 }}>—</span>}</td>
                    <td>{r.property}</td>
                    <td className="num">{money(r.loan_amount)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.closing_date)}</td>
                    <td>{r.lender || <span className="muted">—</span>}</td>
                    {canEdit && (
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button className="btn secondary sm" disabled={busy} onClick={() => openEdit(r)}>Edit</button>{' '}
                        <button className="btn secondary sm" disabled={busy} onClick={() => { setErr(''); setConfirmDel(r); }}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 16 }}>
              {rows.length ? 'No loans match' : 'No brokerage loans yet'}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              {rows.length ? 'Try another search or date range.' : canEdit ? 'Click “Add loan” to record the first one.' : 'An admin can add them here.'}
            </div>
          </div>
        )}
      </div>

      <Modal open={!!editing} onClose={() => !busy && setEditing(null)}
        title={editing === 'new' ? 'Add Brokerage Loan' : 'Edit Brokerage Loan'} maxWidth={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field-wrap">
            <label>Borrower</label>
            <input className="field" value={form.borrowerName}
              onChange={e => setForm(f => ({ ...f, borrowerName: e.target.value }))}
              placeholder="Person or company name" />
          </div>
          <div className="field-wrap">
            <label>Property address *</label>
            <input className="field" value={form.property}
              onChange={e => setForm(f => ({ ...f, property: e.target.value }))}
              onBlur={e => setForm(f => ({ ...f, property: formatAddress(e.target.value) }))}
              placeholder="123 Main St, Springfield, IL 62704" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="field-wrap">
              <label>Loan amount *</label>
              <input className="field" type="number" step="0.01" min="0" inputMode="decimal" value={form.loanAmount}
                onChange={e => setForm(f => ({ ...f, loanAmount: e.target.value }))} />
            </div>
            <div className="field-wrap">
              <label>Closing date *</label>
              <input className="field" type="date" value={form.closingDate}
                onChange={e => setForm(f => ({ ...f, closingDate: e.target.value }))} />
            </div>
          </div>
          <div className="field-wrap">
            <label>Lender</label>
            <input className="field" value={form.lender}
              onChange={e => setForm(f => ({ ...f, lender: e.target.value }))}
              placeholder="Who funded the loan" />
          </div>
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : editing === 'new' ? 'Add loan' : 'Save changes'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        title="Delete brokerage loan"
        message={confirmDel ? `Delete the ${money(confirmDel.loan_amount)} loan at ${confirmDel.property}? This can't be undone.` : ''}
        confirmLabel="Delete" danger
        onConfirm={remove}
        onCancel={() => setConfirmDel(null)}
      />
    </>
  );
}
