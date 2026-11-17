'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { privateLogin, privateLogout } from './actions';

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
      <input className="pv-input" type="password" name="password" placeholder="Password"
             autoComplete="current-password" autoFocus required />
      <button className="pv-btn" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Enter'}</button>
    </form>
  );
}

export function PrivateHome() {
  const router = useRouter();
  async function signOut() {
    await privateLogout();
    router.refresh();
  }
  return (
    <div className="pv-box">
      <h1>Private</h1>
      <p className="pv-note">You are signed in.</p>
      <button className="pv-link" type="button" onClick={signOut}>Sign out</button>
    </div>
  );
}
