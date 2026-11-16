'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PasswordField from '@/components/PasswordField';
import Logo from '@/components/Logo';
import { videosSignIn, videosSignOut } from '@/app/videos/actions';

export default function VideosSignIn() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await videosSignIn(username, password);
    if (!res.ok) { setBusy(false); setError(res.error || 'Could not sign in.'); return; }
    router.refresh();
  }

  return (
    <div className="vid-gate">
      <form className="card vid-gate-card" onSubmit={submit}>
        <Logo size={30} />
        <h1 style={{ margin: '18px 0 6px', fontSize: 22, color: 'var(--navy)' }}>Sign in</h1>
        <div className="field-wrap" style={{ marginBottom: 14 }}>
          <label htmlFor="pv-user">Username</label>
          <input id="pv-user" className="field" required autoComplete="username"
            value={username} onChange={e => setUsername(e.target.value)} />
        </div>
        <div className="field-wrap" style={{ marginBottom: 16 }}>
          <label htmlFor="pv-pass">Password</label>
          <PasswordField id="pv-pass" required autoComplete="current-password"
            value={password} onChange={setPassword} />
        </div>
        {error && <div className="alert error">{error}</div>}
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export function VideosSignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn secondary" type="button" disabled={busy}
      onClick={async () => { setBusy(true); await videosSignOut(); router.refresh(); }}>
      Sign out
    </button>
  );
}
