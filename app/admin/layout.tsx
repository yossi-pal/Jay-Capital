import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import LiveRefresh from '@/components/LiveRefresh';
import IdleTimeout from '@/components/IdleTimeout';
import AdminShell from '@/components/AdminShell';
import WhatsNew from '@/components/WhatsNew';
import { ANNOUNCEMENT_KEY } from '@/lib/announcement';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Shared with the page below through getMe's per-request cache.
  const { user, profile } = await getMe();
  if (!user) redirect('/login?next=/admin');

  const role = profile?.role ?? 'borrower';

  // Only admins and staff belong in the admin area. Lenders go to the lender
  // portal; borrowers (and any role this code does not know) to theirs.
  if (role === 'lender') redirect('/lender');
  if (role !== 'admin' && role !== 'staff') redirect('/portal');

  const isAdmin = role === 'admin';

  // One-time "what's new" pop-up; borrowers never reach this layout.
  const seen = user.user_metadata?.seen_announcements;
  const showNews = !(Array.isArray(seen) && seen.includes(ANNOUNCEMENT_KEY));

  return (
    <>
      <LiveRefresh />
      <IdleTimeout />
      {showNews && <WhatsNew isAdmin={isAdmin} />}
      <AdminShell isAdmin={isAdmin} role={role} name={profile?.full_name || profile?.email || ''}>
        {children}
      </AdminShell>
    </>
  );
}
