import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';
import LiveRefresh from '@/components/LiveRefresh';
import IdleTimeout from '@/components/IdleTimeout';
import AdminShell from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, email')
    .eq('id', user.id)
    .single();

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
