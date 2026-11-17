import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import LiveRefresh from '@/components/LiveRefresh';
import IdleTimeout from '@/components/IdleTimeout';
import AdminShell from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

/**
 * The lender portal: the same frame as the staff app, with only a Loans link.
 * What a lender can see is decided by the database (migration 026), not by
 * this layout -- anyone without a lender login simply gets an empty list.
 */
export default async function LenderLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getMe();
  if (!user) redirect('/login?next=/lender');

  return (
    <>
      <LiveRefresh />
      <IdleTimeout />
      <AdminShell lender isAdmin={false} role="Lender" name={profile?.full_name || profile?.email || user.email || ''}>
        {children}
      </AdminShell>
    </>
  );
}
