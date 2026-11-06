'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PasswordField from '@/components/PasswordField';
import { browserClient } from '@/lib/supabase-browser';
import { requestPasswordReset } from '@/lib/signup';
import Monogram from '@/components/Monogram';

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
    if (error) { setBusy(false); setError(error.message); return; }
    // Stay busy on success: the button would otherwise flash back to "Sign in"
    // while the dashboard or portal is still loading. This page unmounts when
    // the navigation lands.
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

  const icon = (d: React.ReactNode) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  );
  const lock = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
  );

  return (
    <div className="lx">
      {/* Background art: glows, drawn gold arcs and the monogram. Decorative only. */}
      <span className="lx-glow g1" aria-hidden="true" />
      <span className="lx-glow g2" aria-hidden="true" />
      <svg className="lx-arcs" viewBox="0 0 800 800" aria-hidden="true">
        {[140, 220, 300, 380, 460, 540].map((r, i) => (
          <circle key={r} cx="0" cy="800" r={r} style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </svg>
      <Monogram className="lx-mark" height={760} />

      <header className="lx-top">
        <Link href="/" className="side-brand" style={{ padding: 0 }}>
          <Monogram height={46} />
          <span className="wm"><b style={{ fontSize: 19 }}>JAY CAPITAL</b><span style={{ fontSize: 10.5 }}>FUNDING</span></span>
        </Link>
        <a className="lx-phone" href="tel:+18458280731">
          {icon(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />)}
          <span>(845) 828-0731</span>
        </a>
      </header>

      <section className="lx-hero">
        <span className="lx-eyebrow lx-in">Borrower portal</span>
        <h1 className="lx-in d1">Your loan,<br /><span className="gold">always within reach.</span></h1>
        <p className="lx-in d2">See your balance, what&apos;s due and every monthly statement, any time, from any device.</p>
        <div className="lx-tiles">
          <div className="lx-tile lx-in d3">
            <span className="ic">{icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>)}</span>
            <b>Monthly statements</b><span>Ready on the 1st</span>
          </div>
          <div className="lx-tile lx-in d4">
            <span className="ic">{icon(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>)}</span>
            <b>Easy payments</b><span>Instructions in one tap</span>
          </div>
          <div className="lx-tile lx-in d5">
            <span className="ic">{icon(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>)}</span>
            <b>Private &amp; secure</b><span>Only you see your loan</span>
          </div>
        </div>
      </section>

      <section className="lx-card-wrap">
        <div className="lx-card lx-in d2">
          <span className="auth-secure">{lock}Secure sign-in</span>
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
              {busy ? (mode === 'signin' ? 'Signing in…' : 'Working…') : mode === 'signin' ? 'Sign in' : 'Email me a reset link'}
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
          <div className="auth-foot">{lock}Your connection is encrypted</div>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="lx" />}>
      <LoginForm />
    </Suspense>
  );
}
