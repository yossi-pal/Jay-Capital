'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { changePin, privateLogin, privateLogout } from './actions';

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
    <form onSubmit={submit} className="pv-box">
      <h1>Private</h1>
      {error && <p className="pv-err">{error}</p>}
      <input className="pv-input" {...pinProps} name="pin" placeholder="PIN" autoFocus required />
      <button className="pv-btn" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Enter'}</button>
    </form>
  );
}

export function PrivateHome() {
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  async function signOut() {
    await privateLogout();
    router.refresh();
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone('');
    const res = await changePin(null, new FormData(e.currentTarget));
    setBusy(false);
    if (res.ok) {
      setDone(res.message || 'Your PIN has been changed.');
      setChanging(false);
      e.currentTarget.reset();
    } else {
      setError(res.error || 'Something went wrong.');
    }
  }

  return (
    <div className="pv-box">
      <h1>Private</h1>
      <p className="pv-note">You are signed in.</p>
      {done && <p className="pv-ok">{done}</p>}

      {!changing ? (
        <>
          <button className="pv-link" type="button" onClick={() => { setChanging(true); setDone(''); }}>Change PIN</button>
          <button className="pv-link" type="button" onClick={signOut}>Sign out</button>
        </>
      ) : (
        <form onSubmit={submit} className="pv-form">
          {error && <p className="pv-err">{error}</p>}
          <input className="pv-input" {...pinProps} name="current" placeholder="Current PIN" autoFocus required />
          <input className="pv-input" {...pinProps} name="next" placeholder="New PIN (4–12 digits)" required />
          <input className="pv-input" {...pinProps} name="confirm" placeholder="Repeat new PIN" required />
          <button className="pv-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save new PIN'}</button>
          <button className="pv-link" type="button" onClick={() => { setChanging(false); setError(''); }}>Cancel</button>
        </form>
      )}
    </div>
  );
}
