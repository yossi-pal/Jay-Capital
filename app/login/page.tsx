'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PasswordField from '@/components/PasswordField';
import { browserClient } from '@/lib/supabase-browser';
import { requestPasswordReset } from '@/lib/signup';

/**
 * Password sign-in only.
 *
 * The Supabase magic-link option was removed: it is a PKCE flow whose code
 * verifier lives in the browser that started it, so opening the emailed link
 * from a mail app failed with "PKCE code verifier not found in storage".
 * Borrowers create an account at /signup and reset via our own SMTP; admin
 * and staff accounts are created by an existing admin.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/go';

  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const timedOut = params.get('timedout') === '1';

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    const supabase = browserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    router.push(next);
    router.refresh();
  }

  async function forgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    const res = await requestPasswordReset(email);
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not send the reset email.'); return; }
    setInfo(res.message || '');
  }

  const check = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D9B676" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
  );

  return (
    <div className="auth-split">
      <section className="auth-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="watermark" src="/logo-mark.svg" alt="" aria-hidden="true" />
        <Link href="/" className="side-brand" style={{ position: 'relative', padding: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="" width={34} height={50} />
          <span className="wm"><b style={{ fontSize: 20 }}>JAY CAPITAL</b><span style={{ fontSize: 11 }}>FUNDING</span></span>
        </Link>
        <div style={{ position: 'relative' }}>
          <h1>Your loan, always within reach.</h1>
          <p className="hide-sm">See your balance, what&apos;s due and every monthly statement, any time, from any device.</p>
          <ul className="auth-points hide-sm">
            <li>{check}Statements ready each month</li>
            <li>{check}Payment instructions in one tap</li>
            <li>{check}Private and secure, just for you</li>
          </ul>
        </div>
        <span className="hide-sm" style={{ position: 'relative', fontSize: 13, color: '#8597AD' }}>
          Questions? Call <a href="tel:+18458280731" style={{ color: '#DCE3EC' }}>(845) 828-0731</a>
        </span>
      </section>

      <section className="auth-form-side">
        <div className="auth-form">
          <h2>{mode === 'signin' ? 'Welcome back' : 'Reset your password'}</h2>
          <p className="lead">
            {mode === 'signin'
              ? 'Sign in to your Jay Capital account.'
              : 'Enter your email and we\u2019ll send you a link to choose a new password.'}
          </p>

          {timedOut && (
            <div className="alert info" style={{ marginTop: 0 }}>
              You were signed out after a period of inactivity. Please sign in again.
            </div>
          )}

          <form onSubmit={mode === 'signin' ? signIn : forgot}>
            <div className="field-wrap" style={{ marginBottom: 16 }}>
              <label htmlFor="email">Email</label>
              <input id="email" className="field" type="email" required autoComplete="email"
                placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            {mode === 'signin' && (
              <div className="field-wrap" style={{ marginBottom: 16 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <label htmlFor="password">Password</label>
                  <button type="button" className="linkish" style={{ fontSize: 13 }}
                    onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}>
                    Forgot password?
                  </button>
                </span>
                <PasswordField id="password" required autoComplete="current-password"
                  value={password} onChange={setPassword} />
              </div>
            )}

            {error && <div className="alert error">{error}</div>}
            {info && <div className="alert info">{info}</div>}

            <button className="btn" style={{ width: '100%', minHeight: 50, fontSize: 15 }} disabled={busy} type="submit">
              {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Email me a reset link'}
            </button>
          </form>

          {mode === 'forgot' && (
            <button type="button" className="btn secondary" style={{ width: '100%', marginTop: 12 }}
              onClick={() => { setMode('signin'); setError(''); setInfo(''); }}>
              Back to sign in
            </button>
          )}

          <p className="muted" style={{ fontSize: 14, marginTop: 24, textAlign: 'center' }}>
            New here? <Link href="/signup" style={{ fontWeight: 600 }}>Create an account</Link>
          </p>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8, textAlign: 'center' }}>
            Borrowers: use the email address registered on your loan.
          </p>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-split" />}>
      <LoginForm />
    </Suspense>
  );
}
