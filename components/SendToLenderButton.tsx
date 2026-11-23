'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, AlertDialog } from '@/components/Modal';
import { sendDrawRequestToLender } from '@/lib/draw-request-actions';
import { money } from '@/lib/format';

/**
 * "Send to lender": emails the draw request (amount, what it is for, loan
 * figures) to the lender. The To box starts with the lender's portal login
 * addresses and can be changed before sending.
 */
export default function SendToLenderButton({
  requestId, amount, lenderName, lenderEmails, wire = '', wireBlocked = false, small = false,
}: {
  requestId: string; amount: number; lenderName: string | null; lenderEmails: string[];
  /** The wiring stored with this request, which the email will include. */
  wire?: string;
  /** The borrower sent new wiring that is not confirmed by phone yet. */
  wireBlocked?: boolean;
  small?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);

  function start() {
    setTo(lenderEmails.join(', '));
    setMessage('Please see the draw request below for your review and funding.');
    setErr(''); setOpen(true);
  }

  async function submit() {
    if (!to.trim()) { setErr('Please enter the lender’s email address.'); return; }
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.set('to', to); fd.set('message', message);
    const res = await sendDrawRequestToLender(requestId, fd);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'The email could not be sent.'); return; }
    setOpen(false);
    setDone(res.message || 'Sent.');
    router.refresh();
  }

  return (
    <>
      <button className={`btn secondary${small ? ' sm' : ''}`} type="button" onClick={start}>Send to lender</button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Send draw request to lender" maxWidth={520}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Emails the {money(amount)} request to {lenderName || 'the lender'} with the loan number, property,
            borrower, what the draw is for, and how much has been drawn and is left. Replies come back to you.
          </p>
          <div className="field-wrap">
            <label htmlFor="stl-to">To</label>
            <input id="stl-to" className="field" type="text" inputMode="email" autoComplete="off" value={to}
              onChange={e => setTo(e.target.value)} placeholder="name@lender.com" />
            <span className="muted" style={{ fontSize: 12.5 }}>
              {lenderEmails.length
                ? 'Filled in from the lender’s portal logins. Separate more than one address with commas.'
                : 'This lender has no portal logins on file, so type the address. Separate more than one with commas.'}
            </span>
          </div>
          <div className="field-wrap">
            <label htmlFor="stl-msg">Message (optional)</label>
            <textarea id="stl-msg" className="field" rows={3} maxLength={2000} value={message}
              onChange={e => setMessage(e.target.value)} />
          </div>
          <div className="field-wrap">
            <label>Wiring instructions included in the email</label>
            {wireBlocked ? (
              <div className="alert error" style={{ margin: 0 }}>
                The borrower sent new wiring instructions with this request. Call them to confirm the details and
                click <b>Confirmed by phone</b> on the request before sending it to the lender.
              </div>
            ) : wire ? (
              <div style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere', padding: '10px 12px', background: 'var(--pale)', borderRadius: 8, fontSize: 14, lineHeight: 1.5 }}>
                {wire}
              </div>
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>No wiring instructions were sent with this request, so none will be included.</span>
            )}
          </div>
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            <button className="btn secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="button" disabled={busy || wireBlocked} onClick={submit}>{busy ? 'Sending…' : 'Send email'}</button>
          </div>
        </div>
      </Modal>
      <AlertDialog open={!!done} title="Sent" message={done || ''} tone="success" onClose={() => setDone(null)} />
    </>
  );
}
