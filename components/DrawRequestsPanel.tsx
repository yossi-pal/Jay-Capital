'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, AlertDialog } from '@/components/Modal';
import { approveDrawRequest, declineDrawRequest } from '@/lib/draw-request-actions';
import { DRAW_REQUEST_LABEL, drawRequestChip, type DrawRequestRow } from '@/lib/draw-requests';
import { money, fmtDateTime, todayInAppTz } from '@/lib/format';

function todayIso(): string {
  const d = todayInAppTz();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Pending draw requests on a loan, shown at the top of the admin loan page.
 * Approving opens the usual draw fields filled in from the request, so the
 * admin can adjust the amount or date before the draw is recorded.
 */
export function PendingDrawRequests({
  requests, canEdit, available, hasEmail,
}: {
  requests: DrawRequestRow[]; canEdit: boolean; available: number; hasEmail: boolean;
}) {
  const router = useRouter();
  const pending = requests.filter(r => r.status === 'pending');
  const [mode, setMode] = useState<'approve' | 'decline' | null>(null);
  const [req, setReq] = useState<DrawRequestRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [notify, setNotify] = useState(true);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);

  if (pending.length === 0) return null;

  function openFor(r: DrawRequestRow, m: 'approve' | 'decline') {
    setReq(r); setMode(m); setErr('');
    setDate(todayIso()); setAmount(String(r.amount)); setMethod('');
    setNote(r.note ? r.note.slice(0, 200) : ''); setMessage(''); setNotify(hasEmail);
  }

  async function submit() {
    if (!req || !mode) return;
    setErr('');
    if (mode === 'approve') {
      if (!date) { setErr('Please enter the draw date.'); return; }
      if (!(Number(amount) > 0)) { setErr('Draw amount must be greater than zero.'); return; }
    }
    setBusy(true);
    const fd = new FormData();
    fd.set('draw_date', date); fd.set('amount', amount); fd.set('method', method);
    fd.set('note', note); fd.set('message', message); fd.set('notify', notify ? '1' : '');
    const res = mode === 'approve' ? await approveDrawRequest(req.id, fd) : await declineDrawRequest(req.id, fd);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'That did not work.'); return; }
    setMode(null); setReq(null);
    setDone(res.message || 'Done.');
    router.refresh();
  }

  const over = mode === 'approve' && Number(amount) > available + 0.005;

  return (
    <section className="card" style={{ borderColor: '#E9D6AE', marginBottom: 16 }} aria-label="Draw requests waiting">
      <div className="panel-head">
        <h2>Draw {pending.length === 1 ? 'request' : 'requests'} waiting</h2>
        <span className="count">{pending.length}</span>
      </div>
      {pending.map(r => (
        <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid var(--hair)' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <b style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{money(r.amount)}</b>
            <span className="muted" style={{ fontSize: 13 }}>
              {' '}· requested {fmtDateTime(r.requested_at)}
            </span>
            {r.note && <div style={{ fontSize: 14, marginTop: 4, overflowWrap: 'anywhere' }}>{r.note}</div>}
          </div>
          {canEdit ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn secondary" type="button" onClick={() => openFor(r, 'decline')}>Decline</button>
              <button className="btn" type="button" onClick={() => openFor(r, 'approve')}>Approve</button>
            </div>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>An admin can approve or decline</span>
          )}
        </div>
      ))}

      <Modal open={!!mode} onClose={() => !busy && setMode(null)}
        title={mode === 'approve' ? 'Approve draw request' : 'Decline draw request'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {req && (
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              Borrower asked for <b>{money(req.amount)}</b>. {money(available)} is left to draw on this loan.
            </p>
          )}
          {mode === 'approve' && (
            <>
              <div className="field-wrap">
                <label>Draw date</label>
                <input className="field" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="field-wrap">
                <label>Amount</label>
                <input className="field" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              {over && <div className="alert error" style={{ margin: 0 }}>This is more than is left to draw ({money(available)}). You can still approve it.</div>}
              <div className="field-wrap">
                <label>Method</label>
                <input className="field" value={method} onChange={e => setMethod(e.target.value)} placeholder="Wire, check…" />
              </div>
              <div className="field-wrap">
                <label>Note on the draw</label>
                <input className="field" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" />
              </div>
            </>
          )}
          <div className="field-wrap">
            <label>{mode === 'approve' ? 'Message to the borrower (optional)' : 'Reason (shown to the borrower, optional)'}</label>
            <textarea className="field" rows={3} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, opacity: hasEmail ? 1 : 0.6 }}>
            <input type="checkbox" checked={notify && hasEmail} disabled={!hasEmail} onChange={e => setNotify(e.target.checked)} />
            {hasEmail ? 'Email the borrower' : 'No borrower email on file, so no email will be sent'}
          </label>
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            <button className="btn secondary" type="button" disabled={busy} onClick={() => setMode(null)}>Cancel</button>
            <button className={`btn${mode === 'decline' ? ' danger' : ''}`} type="button" disabled={busy} onClick={submit}>
              {busy ? 'Saving…' : mode === 'approve' ? 'Approve and add draw' : 'Decline request'}
            </button>
          </div>
        </div>
      </Modal>
      <AlertDialog open={!!done} title="Done" message={done || ''} tone="success" onClose={() => setDone(null)} />
    </section>
  );
}

/** Every request on the loan, oldest first, for the Draws tab. */
export function DrawRequestHistory({ requests }: { requests: DrawRequestRow[] }) {
  if (requests.length === 0) return null;
  const list = [...requests].sort((a, b) => a.requested_at.localeCompare(b.requested_at));
  return (
    <>
      <h3 style={{ margin: '24px 0 10px', fontSize: 16, color: 'var(--navy)' }}>Draw requests from the borrower</h3>
      <div className="tablescroll">
        <table className="bordered">
          <thead><tr><th>Requested</th><th>Status</th><th>For</th><th>Reply</th><th className="num">Asked</th><th className="num">Approved</th></tr></thead>
          <tbody>
            {list.map(r => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.requested_at)}</td>
                <td><span className={drawRequestChip(r.status)}>{DRAW_REQUEST_LABEL[r.status]}</span></td>
                <td style={{ minWidth: 180 }}>{r.note || ''}</td>
                <td style={{ minWidth: 140 }}>{r.decision_note || ''}</td>
                <td className="num">{money(r.amount)}</td>
                <td className="num">{r.approved_amount != null ? money(r.approved_amount) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
