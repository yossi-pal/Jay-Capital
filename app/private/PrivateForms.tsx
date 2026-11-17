'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { changePin, privateLogin, privateLogout } from './actions';
import { Icon, PvModal } from './ui';

const pinProps = {
  type: 'password' as const,
  inputMode: 'numeric' as const,
  pattern: '[0-9]*',
  autoComplete: 'off',
  maxLength: 12,
};

export function PrivateLogin() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await privateLogin(null, new FormData(e.currentTarget));
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error || 'Something went wrong.');
  }
  return (
    <div className="pv-login">
      <form onSubmit={submit} className="pv-login-card">
        <span className="pv-mark"><Icon name="lock" /></span>
        <h1>Private</h1>
        {error && <p className="pv-err">{error}</p>}
        <input className="pv-input" {...pinProps} name="pin" placeholder="PIN" autoFocus required />
        <button className="pv-btn primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Enter'}</button>
      </form>
    </div>
  );
}

const NAV = [
  { href: '/private/vault', label: 'Vault', icon: 'vault' },
  { href: '/private/ledger', label: 'Ledger', icon: 'ledger' },
];

/** Signed-in frame: left menu (a slide-out drawer on phones) + the page. */
export function PrivateShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const current = NAV.find(n => pathname?.startsWith(n.href));

  async function signOut() {
    await privateLogout();
    router.refresh();
  }

  return (
    <div className="pv-shell">
      <header className="pv-topbar">
        <button className="pv-btn ghost icon" type="button" aria-label="Menu" onClick={() => setOpen(true)}>
          <Icon name="menu" />
        </button>
        {current?.label ?? 'Private'}
      </header>
      <div className={`pv-scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`pv-side${open ? ' open' : ''}`}>
        <div className="pv-brand"><span className="pv-mark"><Icon name="lock" /></span>Private</div>
        <nav className="pv-nav">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} className={pathname?.startsWith(n.href) ? 'active' : ''} onClick={() => setOpen(false)}>
              <Icon name={n.icon} />{n.label}
            </Link>
          ))}
        </nav>
        <div className="pv-side-foot">
          <button type="button" onClick={() => { setPinOpen(true); setOpen(false); }}><Icon name="key" />Change PIN</button>
          <button type="button" onClick={signOut}><Icon name="logout" />Sign out</button>
        </div>
      </aside>
      <main className="pv-main">{children}</main>
      <ChangePinModal open={pinOpen} onClose={() => setPinOpen(false)} />
    </div>
  );
}

function ChangePinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  function close() { setError(''); setDone(''); onClose(); }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError('');
    const res = await changePin(null, new FormData(form));
    setBusy(false);
    if (res.ok) { setDone(res.message || 'Your PIN has been changed.'); form.reset(); }
    else setError(res.error || 'Something went wrong.');
  }

  return (
    <PvModal open={open} title="Change PIN" onClose={close}>
      {done ? (
        <>
          <p className="pv-ok">{done}</p>
          <div className="pv-modal-foot" style={{ padding: '4px 0 8px' }}>
            <button className="pv-btn primary" type="button" onClick={close}>Done</button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <p className="pv-err">{error}</p>}
          <input className="pv-input" {...pinProps} name="current" placeholder="Current PIN" autoFocus required />
          <input className="pv-input" {...pinProps} name="next" placeholder="New PIN (4–12 digits)" required />
          <input className="pv-input" {...pinProps} name="confirm" placeholder="Repeat new PIN" required />
          <div className="pv-modal-foot" style={{ padding: '4px 0 8px' }}>
            <button className="pv-btn" type="button" onClick={close}>Cancel</button>
            <button className="pv-btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save new PIN'}</button>
          </div>
        </form>
      )}
    </PvModal>
  );
}
