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
/**
 * Fine engraved-style wave lines, like the pattern on a banknote or bank
 * check. Computed once here so the page carries no image files.
 */
function waveBand(count: number, baseY: number, gap: number, amp: number, phase: number) {
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    let d = '';
    for (let x = 0; x <= 1440; x += 16) {
      const y = baseY + i * gap
        + amp * Math.sin(x / 260 + i * 0.07 + phase)
        + amp * 0.35 * Math.sin(x / 110 - i * 0.05);
      d += (x === 0 ? 'M' : 'L') + x + ' ' + y.toFixed(1);
    }
    paths.push(d);
  }
  return paths;
}
const WAVES_LOW = waveBand(34, 640, 6, 70, 0);
const WAVES_HIGH = waveBand(22, 40, 6, 55, 2.2);

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

  const lock = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
  );
  const tick = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
  );

  return (
    <div className="lc">
      {/* Background: warm light wash and faint gold engraved waves. Decorative only. */}
      <div className="lc-bg" aria-hidden="true">
        <span className="lc-glow g1" />
        <span className="lc-glow g2" />
        <svg className="lc-waves" viewBox="0 0 1440 900" preserveAspectRatio="none">
          <g className="low">{WAVES_LOW.map((d, i) => <path key={i} d={d} />)}</g>
          <g className="high">{WAVES_HIGH.map((d, i) => <path key={i} d={d} />)}</g>
        </svg>
        <span className="lc-frame" />
      </div>

      <main className="lc-main">
        <Link href="/" className="lc-logo lc-in" aria-label="Jay Capital Funding">
          <Monogram height={58} />
          <span><b>JAY CAPITAL</b><small>FUNDING</small></span>
        </Link>

        <div className="lc-card lc-in d1">
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

        <ul className="lc-chips lc-in d2">
          <li>{tick}Monthly statements</li>
          <li>{tick}Payment instructions</li>
          <li>{tick}Private &amp; secure</li>
        </ul>
        <p className="lc-call lc-in d3">
          Questions? Call <a href="tel:+18458280731">(845) 828-0731</a>
        </p>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="lc" />}>
      <LoginForm />
    </Suspense>
  );
}
