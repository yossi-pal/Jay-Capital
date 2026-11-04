'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserProfile, setUserActive, sendUserPasswordReset, deleteUser, resendInvitation } from '@/lib/actions';
import { Modal, ConfirmDialog, AlertDialog } from '@/components/Modal';

export interface UserRow {
  id: string; email: string; full_name: string | null;
  role: 'admin' | 'staff' | 'borrower'; active: boolean;
  activatedAt?: string | null;
}

export default function UserRowControls({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(user.full_name ?? '');
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [err, setErr] = useState('');
  const [note, setNote] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Pinned to the screen (not the table), so a row near the bottom of a
  // scrolling table never cuts the menu off. Opens upward when there is no
  // room below.
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  // Scrolling would leave a pinned menu floating away from its row: close it.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [menuOpen]);
  function openMenu(btn: HTMLElement) {
    const r = btn.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - r.right);
    setMenuPos(window.innerHeight - r.bottom < 240
      ? { bottom: window.innerHeight - r.top + 6, right }
      : { top: r.bottom + 6, right });
    setMenuOpen(true);
  }

  const done = (res: any, fallback: string) => {
    setBusy(false);
    setNote(res.ok
      ? { msg: res.message || 'Done.', tone: 'success' }
      : { msg: res.error || fallback, tone: 'error' });
    router.refresh();
  };

  async function save() {
    if (!email.trim()) { setErr('Email is required.'); return; }
    setBusy(true); setErr('');
    const res = await updateUserProfile(user.id, { fullName: name, email, role });
    if (!res.ok) { setErr(res.error || 'Could not update the user.'); setBusy(false); return; }
    setEditOpen(false);
    done(res, 'Could not update the user.');
  }

  return (
    <>
      <div className="row-actions">
        <button className="btn secondary sm" disabled={busy} onClick={() => { setErr(''); setEditOpen(true); }}>Edit</button>
        <div className="menu-wrap">
          <button className="btn secondary sm" disabled={busy} aria-haspopup="menu" aria-expanded={menuOpen}
            onClick={e => (menuOpen ? setMenuOpen(false) : openMenu(e.currentTarget))}>
            More
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {menuOpen && (
            <>
              <div className="menu-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
              <div className="menu" role="menu" style={menuPos ?? undefined}
                onKeyDown={e => { if (e.key === 'Escape') setMenuOpen(false); }}>
                <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setConfirmReset(true); }}>Send password reset</button>
                {!user.activatedAt && (
                  <button role="menuitem" type="button"
                    onClick={async () => { setMenuOpen(false); setBusy(true); done(await resendInvitation(user.id), 'Could not resend the invitation.'); }}>
                    Resend invitation
                  </button>
                )}
                {!isSelf && (user.active
                  ? <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setConfirmOff(true); }}>Block sign-in</button>
                  : <button role="menuitem" type="button" onClick={async () => { setMenuOpen(false); setBusy(true); done(await setUserActive(user.id, true), 'Could not reactivate.'); }}>Allow sign-in again</button>
                )}
                {!isSelf && <button role="menuitem" type="button" className="danger" onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}>Delete user</button>}
              </div>
            </>
          )}
        </div>
      </div>

      <Modal open={editOpen} onClose={() => !busy && setEditOpen(false)} title="Edit User" maxWidth={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field-wrap"><label>Name</label>
            <input className="field" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field-wrap"><label>Email</label>
            <input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field-wrap"><label>Role</label>
            <select className="field" value={role} onChange={e => setRole(e.target.value as any)} disabled={isSelf}>
              <option value="admin">admin</option>
              <option value="staff">staff</option>
              <option value="borrower">borrower</option>
            </select>
            {isSelf && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>You can&apos;t change your own role.</p>}
          </div>
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setEditOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmReset}
        title="Send password reset"
        message={`Email a password reset link to ${user.email}?`}
        confirmLabel="Send link"
        onConfirm={async () => { setConfirmReset(false); setBusy(true); done(await sendUserPasswordReset(user.email), 'Could not send the reset email.'); }}
        onCancel={() => setConfirmReset(false)}
      />

      <ConfirmDialog
        open={confirmOff}
        title="Inactivate user"
        message={`Inactivate ${user.email}? They will immediately be unable to sign in. Their records are kept and you can reactivate them at any time.`}
        confirmLabel="Inactivate" danger
        onConfirm={async () => { setConfirmOff(false); setBusy(true); done(await setUserActive(user.id, false), 'Could not inactivate.'); }}
        onCancel={() => setConfirmOff(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete user"
        message={`Permanently delete the login for ${user.email}? This cannot be undone. Their loans and borrower records are kept, but the borrower will lose portal access until a new login is created.`}
        confirmLabel="Delete user" danger
        onConfirm={async () => { setConfirmDelete(false); setBusy(true); done(await deleteUser(user.id), 'Could not delete the user.'); }}
        onCancel={() => setConfirmDelete(false)}
      />

      <AlertDialog
        open={!!note}
        title={note?.tone === 'error' ? "That didn't work" : 'Users'}
        message={note?.msg || ''}
        tone={note?.tone || 'success'}
        onClose={() => setNote(null)}
      />
    </>
  );
}
