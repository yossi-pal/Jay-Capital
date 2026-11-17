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

export function ProxyHome({ token }: { token: string }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  function go(e: React.FormEvent) {
    e.preventDefault();
    let u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    window.location.href = `/private/p/${token}?__px_u=${encodeURIComponent(u)}`;
  }
  async function signOut() {
    await privateLogout();
    router.refresh();
  }
  return (
    <div className="pv-box pv-wide">
      <h1>Open a page</h1>
      <form onSubmit={go} className="pv-row">
        <input className="pv-input" type="text" inputMode="url" autoCapitalize="off" autoCorrect="off"
               spellCheck={false} placeholder="Type a web address, e.g. example.com"
               value={url} onChange={e => setUrl(e.target.value)} autoFocus />
        <button className="pv-btn" type="submit">Go</button>
      </form>
      <button className="pv-link" type="button" onClick={signOut}>Sign out</button>
    </div>
  );
}
