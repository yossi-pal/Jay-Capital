import { serverClient } from '@/lib/supabase-server';
import InviteUser from '@/components/InviteUser';
import UsersList from '@/components/UsersList';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  if (me?.role !== 'admin') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin only.</div></div></div>;
  }
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, active, invited_at, activated_at, last_seen_at')
    .order('email');

  return (
    <div className="wrap" style={{ maxWidth: 1400 }}>
      <div className="page-head">
        <div className="grow">
          <h1>Users</h1>
          <div className="sub">
            Admins manage everything. Staff can view and send statements. Borrowers see only
            their own loans &mdash; add a borrower login from their loan page. Blocking someone
            stops their sign-in without deleting anything.
          </div>
        </div>
        <InviteUser />
      </div>
      <UsersList users={(profiles ?? []) as any} selfId={user?.id ?? ''} />
    </div>
  );
}
