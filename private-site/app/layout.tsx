import type { Metadata, Viewport } from 'next';
import { isPrivateSignedIn } from '@/lib/private-auth';
import { PrivateLogin, PrivateShell } from './PrivateForms';
import './globals.css';

// Personal site: keep it out of search engines and give the tab a bland name.
export const metadata: Metadata = {
  title: 'Private',
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = { themeColor: '#F6F6F4' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await isPrivateSignedIn();
  return (
    <html lang="en">
      <body>
        <div className="pv-root">
          {signedIn ? <PrivateShell>{children}</PrivateShell> : <PrivateLogin />}
        </div>
      </body>
    </html>
  );
}
