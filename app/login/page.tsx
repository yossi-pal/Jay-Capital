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
// Thin line drawing of homes along the bottom of the login page.
const SKYLINE = 'M0 219h1200 M40 219V130l70-55 70 55v89 M85 219v-50h30v50 M130 140h28v26h-28z M95 64V40h18v20 M210 219V95h110v124 M228 115h22v22h-22z M280 115h22v22h-22z M228 160h22v22h-22z M280 160h22v22h-22z M350 219V150l55-42 55 42v69 M390 219v-40h30v40 M490 219V60l40-30 40 30v159 M510 85h20v20h-20z M550 85h20v20h-20z M510 130h20v20h-20z M550 130h20v20h-20z M510 175h20v20h-20z M550 175h20v20h-20z M600 219V140l80-62 80 62v79 M650 219v-56h40v56 M705 150h30v28h-30z M660 66V44h18v20 M790 219V110h90v109 M805 130h22v22h-22z M843 130h22v22h-22z M805 172h22v22h-22z M843 172h22v22h-22z M910 219V155l60-46 60 46v64 M950 219v-42h40v42 M1060 219V100l50-38 50 38v119 M1085 125h22v22h-22z M1120 125h22v22h-22z M1085 168h22v22h-22z';

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
      {/* Light background art: drifting glows, dot grid, gold arcs, a skyline of
          homes drawn in thin gold line and a faint monogram. Decorative only. */}
      <div className="lc-bg" aria-hidden="true">
        <span className="lc-glow g1" />
        <span className="lc-glow g2" />
        <span className="lc-glow g3" />
        <span className="lc-dots" />
        <svg className="lc-arcs" viewBox="0 0 600 600">
          {[120, 190, 260, 330, 400].map((r, i) => (
            <circle key={r} cx="600" cy="0" r={r} style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </svg>
        <Monogram className="lc-mark" height={560} />
        {(['left', 'right'] as const).map(side => (
          <svg key={side} className={`lc-skyline ${side}`} viewBox={side === 'left' ? '0 0 600 220' : '600 0 600 220'}>
            <path pathLength={1} d={SKYLINE} />
          </svg>
        ))}
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
