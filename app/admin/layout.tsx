import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import LiveRefresh from '@/components/LiveRefresh';
import IdleTimeout from '@/components/IdleTimeout';
import AdminShell from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Shared with the page below through getMe's per-request cache.
  const { user, profile } = await getMe();
  if (!user) redirect('/login?next=/admin');

  const role = profile?.role ?? 'borrower';

  // Borrowers don't belong in the admin area -- send them to their portal.
  if (role === 'borrower') redirect('/portal');

  const isAdmin = role === 'admin';

  return (
    <>
      <LiveRefresh />
      <IdleTimeout />
      <AdminShell isAdmin={isAdmin} role={role} name={profile?.full_name || profile?.email || ''}>
        {children}
      </AdminShell>
    </>
  );
}
