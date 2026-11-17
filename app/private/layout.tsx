import type { Metadata } from 'next';
import { isPrivateSignedIn } from '@/lib/private-auth';
import { PrivateLogin, PrivateShell } from './PrivateForms';
import './private.css';

// Hidden area: keep it out of search engines and give the tab a bland name.
export const metadata: Metadata = {
  title: 'Private',
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = 'force-dynamic';

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await isPrivateSignedIn();
  return (
    <div className="pv-root">
      {signedIn ? <PrivateShell>{children}</PrivateShell> : <PrivateLogin />}
    </div>
  );
}
