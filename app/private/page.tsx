import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { PRIVATE_COOKIE, tokenIsValid } from '@/lib/private-auth';
import { PrivateLogin, PrivateHome } from './PrivateForms';

// Hidden area: keep it out of search engines and give the tab a bland name.
export const metadata: Metadata = {
  title: 'Private',
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = 'force-dynamic';

export default function PrivatePage() {
  const token = cookies().get(PRIVATE_COOKIE)?.value;
  const signedIn = tokenIsValid(token);
  return (
    <main className="pv-page">
      {signedIn ? <PrivateHome /> : <PrivateLogin />}
      <style>{`
        .pv-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--bg); }
        .pv-box { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow);
                  padding: 28px 24px; width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 12px; }
        .pv-box h1 { margin: 0 0 4px; font-size: 20px; color: var(--navy); }
        .pv-note { margin: 0; color: var(--muted); }
        .pv-input { flex: 1; min-width: 0; padding: 11px 12px; font-size: 16px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit; }
        .pv-btn { padding: 11px 20px; font-size: 15px; font-weight: 600; border: 0; border-radius: 8px; background: var(--navy); color: #fff; cursor: pointer; }
        .pv-btn:disabled { opacity: .6; }
        .pv-err { margin: 0; color: var(--danger); }
        .pv-link { align-self: flex-start; background: none; border: 0; padding: 0; color: var(--muted); cursor: pointer; font: inherit; text-decoration: underline; }
      `}</style>
    </main>
  );
}
