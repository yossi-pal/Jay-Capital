'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, ConfirmDialog, AlertDialog } from '@/components/Modal';
import { requestDraw, cancelDrawRequest } from '@/lib/draw-request-actions';
import { DRAW_REQUEST_LABEL, drawRequestChip, type DrawRequestRow } from '@/lib/draw-requests';
import { money, fmtDateTime } from '@/lib/format';

/**
 * Borrower portal card: what is left to draw, a "Request a draw" button, and
 * the borrower's own requests with where each one stands.
 */
export default function DrawRequestCard({
  loanId, available, canRequest, requests,
}: {
  loanId: string;
  available: number;
  /** False once the loan is paid off or nothing is left to draw. */
  canRequest: boolean;
  requests: DrawRequestRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const pending = requests.find(r => r.status === 'pending');
  const list = [...requests].sort((a, b) => b.requested_at.localeCompare(a.requested_at));

  async function submit() {
    setErr('');
    const n = Number(amount.replace(/[$,\s]/g, ''));
    if (!(n > 0)) { setErr('Please enter the amount you need.'); return; }
    if (n > available + 0.005) { setErr(`That is more than is left to draw (${money(available)}).`); return; }
    if (!note.trim()) { setErr('Please tell us briefly what the draw is for.'); return; }
    setBusy(true);
    const fd = new FormData();
    fd.set('amount', String(n));
    fd.set('note', note);
    const res = await requestDraw(loanId, fd);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Your request could not be sent.'); return; }
    setOpen(false);
    setAmount(''); setNote('');
    setDone(res.message || 'Your draw request was sent.');
    router.refresh();
  }

  async function doCancel() {
    const id = cancelId; setCancelId(null);
    if (!id) return;
    setBusy(true);
    const res = await cancelDrawRequest(id);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not cancel the request.'); setDone(null); return; }
    setDone(res.message || 'Your request was cancelled.');
    router.refresh();
  }

  if (!canRequest && requests.length === 0) return null;

  return (
    <section className="card bcard">
      <h2 className="bcard-h">Construction draws</h2>
      {canRequest && (
        <div className="kv" style={{ borderTop: 0, paddingTop: 0 }}>
          <span>Available to draw</span><span>{money(available)}</span>
        </div>
      )}
      {canRequest && (
        pending ? (
          <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 4px' }}>
            Your request for <b>{money(pending.amount)}</b> is waiting for review. We&apos;ll email you once it&apos;s been looked at.
          </p>
        ) : (
          <button className="btn" type="button" style={{ margin: '6px 0 4px' }}
            onClick={() => { setErr(''); setOpen(true); }}>
            Request a draw
          </button>
        )
      )}

      {list.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {list.slice(0, showAll ? list.length : 4).map(r => (
            <div key={r.id} style={{ padding: '11px 0', borderTop: '1px solid var(--hair)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {money(r.status === 'approved' && r.approved_amount != null ? r.approved_amount : r.amount)}
                </b>
                <span className={drawRequestChip(r.status)}>{DRAW_REQUEST_LABEL[r.status]}</span>
                <span style={{ flex: 1 }} />
                {r.status === 'pending' && (
                  <button type="button" className="btn secondary sm" disabled={busy}
                    onClick={() => setCancelId(r.id)}>Cancel</button>
                )}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                Requested {fmtDateTime(r.requested_at)}
                {r.status === 'approved' && r.approved_amount != null && Math.abs(Number(r.approved_amount) - Number(r.amount)) > 0.005
                  ? ` · you asked for ${money(r.amount)}` : ''}
              </div>
              {r.note && <div style={{ fontSize: 13.5, marginTop: 4, overflowWrap: 'anywhere' }}>{r.note}</div>}
              {r.decision_note && (r.status === 'approved' || r.status === 'declined') && (
                <div className="alert info" style={{ margin: '8px 0 0', overflowWrap: 'anywhere' }}>
                  <b>From Jay Capital:</b> {r.decision_note}
                </div>
              )}
            </div>
          ))}
          {list.length > 4 && (
            <button type="button" className="linkish" style={{ marginTop: 12, fontWeight: 600 }} onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Show fewer' : `Show all ${list.length} requests`}
            </button>
          )}
        </div>
      )}

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Request a draw">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Up to {money(available)} is available. We&apos;ll review your request and email you once it&apos;s approved.
          </p>
          <div className="field-wrap">
            <label htmlFor="dr-amount">Amount</label>
            <input id="dr-amount" className="field" type="number" inputMode="decimal" step="0.01" min="0"
              value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field-wrap">
            <label htmlFor="dr-note">What is this draw for?</label>
            <textarea id="dr-note" className="field" rows={3} maxLength={1000} value={note}
              onChange={e => setNote(e.target.value)} placeholder="e.g. Framing complete, roofing materials" />
          </div>
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            <button className="btn secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="button" disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send request'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!cancelId}
        title="Cancel draw request"
        message="Cancel this draw request? You can send a new one afterwards."
        confirmLabel="Cancel request" cancelLabel="Keep it" danger
        onConfirm={doCancel}
        onCancel={() => setCancelId(null)}
      />
      <AlertDialog
        open={!!done || (!open && !!err)}
        title={done ? 'Done' : "That didn't work"}
        message={done || err}
        tone={done ? 'success' : 'error'}
        onClose={() => { setDone(null); setErr(''); }}
      />
    </section>
  );
}
