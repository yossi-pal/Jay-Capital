'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createLender, updateLender, setLenderActive, inviteLenderLogin, removeLenderLogin, resendInvitation } from '@/lib/actions';
import { Modal, ConfirmDialog, AlertDialog } from '@/components/Modal';
import { money, fmtDateTime } from '@/lib/format';
import Link from 'next/link';

export interface LenderLogin {
  id: string; email: string; full_name: string | null; user_id: string | null;
  invited_at: string | null; activated_at: string | null; last_seen_at: string | null; blocked: boolean;
}

export interface LenderRow {
  id: string; name: string; short_name: string | null; active: boolean; loan_count: number;
  active_loans: number; committed: number;
  payment_method: string | null; payment_instructions: string | null;
  logins: LenderLogin[];
}

const BLANK = { name: '', shortName: '', paymentMethod: '', paymentInstructions: '' };

export default function LenderManager({ lenders }: { lenders: LenderRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [editing, setEditing] = useState<LenderRow | null>(null);
  const [confirmOff, setConfirmOff] = useState<LenderRow | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'inactive' | 'all'>('active');
  // Lender logins: who can sign in to /lender and see this lender's loans.
  const [loginFor, setLoginFor] = useState<LenderRow | null>(null);
  const [loginForm, setLoginForm] = useState({ email: '', fullName: '' });
  const [confirmRemove, setConfirmRemove] = useState<{ login: LenderLogin; lender: LenderRow } | null>(null);

  async function addLogin() {
    if (!loginFor) return;
    if (!loginForm.email.trim()) { setErr('Email is required.'); return; }
    setBusy(true); setErr('');
    const res = await inviteLenderLogin(loginFor.id, loginForm);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not add the login.'); return; }
    setLoginFor(null); setNote(res.message || 'Login added.');
    router.refresh();
  }

  async function removeLogin(login: LenderLogin) {
    setConfirmRemove(null);
    setBusy(true);
    const res = await removeLenderLogin(login.id);
    setBusy(false);
    setNote(res.ok ? (res.message || 'Access removed.') : (res.error || 'Could not remove the login.'));
    router.refresh();
  }

  async function resend(login: LenderLogin) {
    if (!login.user_id) return;
    setBusy(true);
    const res = await resendInvitation(login.user_id);
    setBusy(false);
    setNote(res.ok ? (res.message || 'Invitation re-sent.') : (res.error || 'Could not re-send the invitation.'));
  }

  async function add() {
    if (!form.name.trim()) { setErr('Lender name is required.'); return; }
    setBusy(true); setErr('');
    const res = await createLender(form);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not add the lender.'); return; }
    setAddOpen(false); setForm({ ...BLANK }); setNote(res.message || 'Lender added.');
    router.refresh();
  }

  async function saveEdit() {
    if (!editing) return;
    if (!form.name.trim()) { setErr('Lender name is required.'); return; }
    setBusy(true); setErr('');
    const res = await updateLender(editing.id, form);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not update the lender.'); return; }
    setEditing(null); setNote(res.message || 'Lender updated.');
    router.refresh();
  }

  const fields = (
    <>
      <div className="field-wrap">
        <label>Full name *</label>
        <input className="field" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Shown on the loan view" />
      </div>
      <div className="field-wrap">
        <label>Short name</label>
        <input className="field" value={form.shortName}
          onChange={e => setForm(f => ({ ...f, shortName: e.target.value }))}
          placeholder="Shown on the dashboard (defaults to full name)" />
      </div>
      <div className="field-wrap">
        <label>Payment method</label>
        <input className="field" value={form.paymentMethod}
          onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
          placeholder="e.g. Wire transfer, or Zelle QuickPay" />
      </div>
      <div className="field-wrap">
        <label>Payment instructions</label>
        <textarea className="field" rows={5} value={form.paymentInstructions}
          onChange={e => setForm(f => ({ ...f, paymentInstructions: e.target.value }))}
          placeholder={'Wire details or QuickPay address.\nShown to borrowers at the bottom of their statement.'} />
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Borrowers see this text. Statements name the servicer as Jay Capital Funding,
          not the lender, so leave the lender&rsquo;s name out if it should stay private.
        </p>
      </div>
    </>
  );

  async function toggle(l: LenderRow, active: boolean) {
    setConfirmOff(null);
    setBusy(true);
    const res = await setLenderActive(l.id, active);
    setBusy(false);
    setNote(res.ok ? (res.message || 'Updated.') : (res.error || 'Could not update the lender.'));
    router.refresh();
  }

  const activeCount = lenders.filter(l => l.active).length;
  const inactiveCount = lenders.length - activeCount;
  const view = lenders.filter(l => filter === 'all' || (filter === 'active' ? l.active : !l.active));

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Lenders</h1>
          <div className="sub">
            These fill the lender list on new and edited loans. Inactivating one keeps it on
            existing loans but stops it being offered for new ones.
          </div>
        </div>
        <button className="btn" onClick={() => { setErr(''); setForm({ ...BLANK }); setAddOpen(true); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D9B676" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Add lender
        </button>
      </div>

      <div className="chips" role="group" aria-label="Show lenders">
        {([['active', 'Active', activeCount], ['inactive', 'Inactive', inactiveCount], ['all', 'All', lenders.length]] as const).map(([v, label, n]) => (
          <button key={v} type="button" className={`fchip${filter === v ? ' on' : ''}`} aria-pressed={filter === v} onClick={() => setFilter(v)}>
            {label} <span className="n">{n}</span>
          </button>
        ))}
      </div>

      <div className="lender-grid">
        {view.map(l => (
          <section key={l.id} className={`card lender-card${l.active ? '' : ' off'}`}>
            <div className="lc-top">
              <span className="lc-ic" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" /></svg>
              </span>
              <span className="lc-name">
                <b>{l.name}</b>
                <span>{l.short_name ? `Shows as \u201c${l.short_name}\u201d on the loan list` : 'No short name'}</span>
              </span>
              {l.active ? <span className="chip ok">Active</span> : <span className="chip">Inactive</span>}
            </div>
            <div className="lc-stats">
              <Link className="lc-link" href={`/admin/loans?status=active&lender=${encodeURIComponent(l.name)}`}
                title={`See ${l.name}'s active loans`}>
                <span>Active loans</span><b>{l.active_loans} <span aria-hidden="true">→</span></b>
              </Link>
              <div><span>Committed</span><b title={money(l.committed)}>${Math.round(l.committed).toLocaleString('en-US')}</b></div>
              <div><span>All-time loans</span><b>{l.loan_count}</b></div>
            </div>
            <div className="lc-pay">
              <span>Borrowers pay by</span>
              <b>{l.payment_method || <span className="muted" style={{ fontWeight: 400 }}>Not set yet</span>}</b>
            </div>
            <div className="lc-logins">
              <div className="lc-head">
                <span>Lender portal logins</span>
                <button className="btn secondary sm" disabled={busy}
                  onClick={() => { setErr(''); setLoginForm({ email: '', fullName: '' }); setLoginFor(l); }}>Add login</button>
              </div>
              {l.logins.length === 0 && (
                <span className="muted" style={{ fontSize: 13 }}>Nobody at this lender can sign in yet.</span>
              )}
              {l.logins.map(x => (
                <div key={x.id} className="lc-login">
                  <span className="who">
                    {x.full_name || x.email}
                    <span>
                      {x.full_name ? `${x.email} · ` : ''}
                      {x.blocked ? 'Sign-in blocked'
                        : x.activated_at ? (x.last_seen_at ? `Last signed in ${fmtDateTime(x.last_seen_at)}` : 'Set up')
                        : x.invited_at ? 'Invited, not set up yet' : 'Not set up yet'}
                    </span>
                  </span>
                  {!x.activated_at && x.user_id && (
                    <button className="btn secondary sm" disabled={busy} onClick={() => resend(x)}>Resend invite</button>
                  )}
                  <button className="btn secondary sm" disabled={busy}
                    onClick={() => setConfirmRemove({ login: x, lender: l })}>Remove</button>
                </div>
              ))}
            </div>
            <div className="lc-actions">
              <button className="btn secondary sm" disabled={busy}
                onClick={() => {
                  setEditing(l);
                  setForm({
                    name: l.name,
                    shortName: l.short_name || '',
                    paymentMethod: l.payment_method || '',
                    paymentInstructions: l.payment_instructions || '',
                  });
                  setErr('');
                }}>Edit</button>
            </div>
          </section>
        ))}
      </div>
      {view.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{lenders.length ? 'No lenders here' : 'No lenders yet'}</div>
          <div className="muted" style={{ marginTop: 4 }}>{lenders.length ? 'Try another filter.' : 'Add your first lender to get started.'}</div>
        </div>
      )}

      <Modal open={addOpen} onClose={() => !busy && setAddOpen(false)} title="Add Lender" maxWidth={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields}
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={add}>{busy ? 'Adding…' : 'Add lender'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => !busy && setEditing(null)} title="Edit Lender" maxWidth={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields}
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={saveEdit}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
          {editing && (
            <div className="danger-zone" style={{ marginTop: 6 }}>
              {editing.active ? (
                <>
                  <span>
                    <b style={{ color: 'var(--danger)', display: 'block' }}>Inactivate this lender</b>
                    <span className="muted">It stays on the loans already using it, but won&rsquo;t be offered for new loans.</span>
                  </span>
                  <button className="btn danger" disabled={busy}
                    onClick={() => { const l = editing; setEditing(null); setConfirmOff(l); }}>Inactivate</button>
                </>
              ) : (
                <>
                  <span>
                    <b style={{ display: 'block', color: 'var(--navy)' }}>This lender is inactive</b>
                    <span className="muted">Reactivate it to offer it again on new loans.</span>
                  </span>
                  <button className="btn" disabled={busy}
                    onClick={() => { const l = editing; setEditing(null); toggle(l, true); }}>Reactivate</button>
                </>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmOff}
        title="Inactivate lender"
        message={confirmOff
          ? `Inactivate ${confirmOff.name}? It stays on the ${confirmOff.loan_count} loan(s) already using it, but won't be offered when creating new loans.`
          : ''}
        confirmLabel="Inactivate" danger
        onConfirm={() => confirmOff && toggle(confirmOff, false)}
        onCancel={() => setConfirmOff(null)}
      />

      <Modal open={!!loginFor} onClose={() => !busy && setLoginFor(null)} title="Add Lender Login" maxWidth={520}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {loginFor?.name} will be able to sign in and see, read only, every loan they funded: loan
            figures, the borrower&rsquo;s name, email and phone, and all draws and payments. They get an
            email from Jay Capital Funding with a link to choose a password.
          </p>
          <div className="field-wrap">
            <label>Full name</label>
            <input className="field" value={loginForm.fullName} autoComplete="off"
              onChange={e => setLoginForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Person at the lender" />
          </div>
          <div className="field-wrap">
            <label>Email *</label>
            <input className="field" type="email" value={loginForm.email} autoComplete="off" inputMode="email"
              onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))} placeholder="name@lender.com" />
          </div>
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setLoginFor(null)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={addLogin}>{busy ? 'Sending…' : 'Send invitation'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove lender login"
        message={confirmRemove
          ? `Stop ${confirmRemove.login.email} from seeing ${confirmRemove.lender.name}'s loans? Their account is kept (block or delete it on the Users page if they should not sign in at all).`
          : ''}
        confirmLabel="Remove access" danger
        onConfirm={() => confirmRemove && removeLogin(confirmRemove.login)}
        onCancel={() => setConfirmRemove(null)}
      />

      <AlertDialog open={!!note} title="Lenders" message={note || ''} tone="success" onClose={() => setNote(null)} />
    </>
  );
}
