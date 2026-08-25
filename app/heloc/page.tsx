import Link from 'next/link';
import type { Metadata } from 'next';
import Logo from '@/components/Logo';
import HelocApplication from '@/components/HelocApplication';
import { todayInAppTz } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Apply for a HELOC — Jay Capital Funding',
  description:
    'Apply for a home equity line of credit with Jay Capital Funding, placed through Onyx Equity Partners. Draw against equity you have already built and pay interest only on what you use.',
};

const PHONE = '(845) 828-0731';
const PHONE_HREF = 'tel:+18458280731';

const POINTS = [
  {
    title: 'Pay for what you use',
    body: 'A line of credit, not a lump sum. Interest applies only to the portion you have actually drawn, so an unused line costs you nothing.',
  },
  {
    title: 'Draw when the timing suits',
    body: 'Useful when a project’s schedule is not fixed yet — take what you need, when you need it, rather than borrowing against a date you are guessing at.',
  },
  {
    title: 'Your equity stays yours',
    body: 'A HELOC sits behind your existing mortgage. You keep the rate you already have on your first loan.',
  },
];

export default function HelocPage() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-shell lp-nav-in">
          <Link href="/" aria-label="Jay Capital Funding home" style={{ textDecoration: 'none' }}>
            <Logo size={34} />
          </Link>
          <nav className="lp-nav-links">
            <Link href="/">Home</Link>
            <a href={PHONE_HREF}>{PHONE}</a>
            <Link className="lp-btn" href="/login">Borrower Portal</Link>
          </nav>
        </div>
      </header>

      <section className="lp-hero" style={{ paddingBottom: 40 }}>
        <div className="lp-shell">
          <div style={{ maxWidth: '62ch' }}>
            <div className="lp-eyebrow">Home equity line of credit</div>
            <div className="lp-rule" style={{ marginTop: 18 }} />
            <h1>Borrow against<br />what you have built.</h1>
            <p className="lp-lede">
              Tell us about the property and roughly where the numbers sit. We will come
              back with what is available to you — and if it is not the right product for
              what you are trying to do, we will say so.
            </p>
          </div>

          <div className="lp-grid" style={{ marginTop: 40 }}>
            {POINTS.map(p => (
              <article className="lp-card" key={p.title}>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section alt" style={{ paddingTop: 52 }}>
        <div className="lp-shell lp-hero-grid" style={{ alignItems: 'start' }}>
          <div>
            <div className="lp-eyebrow">The application</div>
            <h2 style={{ marginTop: 14 }}>A few details to get started.</h2>
            <p style={{ color: '#4A5568', fontSize: 16.5, maxWidth: '44ch', marginTop: 14 }}>
              It takes a couple of minutes. Nothing here affects your credit — this is an
              enquiry, not a formal credit application.
            </p>

            <div className="lp-partner">
              <span className="lp-partner-lbl">Processed through</span>
              <img src="/onyx-equity-partners.svg" alt="Onyx Equity Partners"
                   width="210" style={{ display: 'block', width: 210, maxWidth: '100%', height: 'auto' }} />
              <p className="lp-partner-note">
                Jay Capital Funding places all home equity lines of credit through
                Onyx Equity Partners. Your application goes to our team first, and we
                handle it from there.
              </p>
            </div>

            <p className="muted" style={{ fontSize: 13, marginTop: 22, maxWidth: '40ch' }}>
              Prefer to talk it through first? Call{' '}
              <a href={PHONE_HREF} style={{ color: 'var(--navy-med)' }}>{PHONE}</a>.
            </p>
          </div>

          <HelocApplication />
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-shell lp-foot-row">
          <Logo size={30} tone="light" />
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href={PHONE_HREF}>{PHONE}</a>
            <Link href="/">Home</Link>
            <Link href="/login">Borrower Portal</Link>
          </div>
          <div>&copy; {todayInAppTz().getFullYear()} Jay Capital Funding Inc.</div>
        </div>
      </footer>
    </div>
  );
}
