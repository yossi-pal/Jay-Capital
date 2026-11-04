'use client';

import { useMemo, useState } from 'react';
import UserRowControls from '@/components/UserRowControls';
import InviteStatus from '@/components/InviteStatus';

export interface UserListRow {
  id: string; email: string; full_name: string | null;
  role: 'admin' | 'staff' | 'borrower'; active: boolean | null;
  invited_at: string | null; activated_at: string | null; last_seen_at: string | null;
}

const ROLE_LABEL = { admin: 'Admin', staff: 'Staff', borrower: 'Borrower' } as const;

/** Everyone with a login: filter by role, search by name or email. */
export default function UsersList({ users, selfId }: { users: UserListRow[]; selfId: string }) {
  const [role, setRole] = useState<'' | 'admin' | 'staff' | 'borrower'>('');
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    const c = { '': users.length, admin: 0, staff: 0, borrower: 0 } as Record<string, number>;
    for (const u of users) c[u.role] = (c[u.role] ?? 0) + 1;
    return c;
  }, [users]);

  const view = users.filter(u => {
    if (role && u.role !== role) return false;
    if (q && !`${u.full_name ?? ''} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="chips" role="group" aria-label="Show users">
        {([['', 'Everyone'], ['admin', 'Admins'], ['staff', 'Staff'], ['borrower', 'Borrowers']] as const).map(([v, label]) => (
          <button key={v || 'all'} type="button" className={`fchip${role === v ? ' on' : ''}`}
            aria-pressed={role === v} onClick={() => setRole(v)}>
            {label} <span className="n">{counts[v] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'visible' }}>
        <div className="toolbar" style={{ padding: '16px 18px', marginBottom: 0, borderBottom: '1px solid var(--line)' }}>
          <input className="search" placeholder="Search by name or email…" aria-label="Search users"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="tablescroll userlist">
          <table>
            <thead>
              <tr><th>User</th><th>Role</th><th>Access</th><th>Sign-in</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {view.map(u => {
                const label = u.full_name || u.email;
                const initials = label.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="u-who">
                        <span className={`u-av ${u.role}`} aria-hidden="true">{initials}</span>
                        <span className="u-txt">
                          <b>{u.full_name || <span className="muted" style={{ fontWeight: 500 }}>No name</span>}{u.id === selfId && <span className="u-you">You</span>}</b>
                          <span>{u.email}</span>
                        </span>
                      </div>
                    </td>
                    <td><span className={`chip ${u.role === 'admin' ? 'navy' : u.role === 'staff' ? 'gold' : 'ok'}`}>{ROLE_LABEL[u.role] ?? u.role}</span></td>
                    <td>{u.active === false ? <span className="chip late">Blocked</span> : <span className="chip ok">Active</span>}</td>
                    <td style={{ minWidth: 200 }}>
                      <InviteStatus invitedAt={u.invited_at} activatedAt={u.activated_at} lastSeenAt={u.last_seen_at} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <UserRowControls
                        user={{
                          id: u.id, email: u.email, full_name: u.full_name, role: u.role,
                          active: u.active !== false, activatedAt: u.activated_at,
                        }}
                        isSelf={u.id === selfId}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {view.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontWeight: 600, color: 'var(--navy)' }}>No users match</div>
            <div className="muted" style={{ marginTop: 4 }}>Try a different search or filter.</div>
          </div>
        )}
      </div>
    </>
  );
}
