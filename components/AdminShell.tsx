'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Monogram from '@/components/Monogram';

/**
 * The staff app frame: a navy side menu beside the page. On any phone or
 * tablet (either way up) and on narrow windows, the menu tucks away behind a
 * top bar, slides in when the three-line button is tapped, and closes with
 * the « button, a tap outside it, or Escape.
 */

type IconName = 'home' | 'loans' | 'chart' | 'plus' | 'upload' | 'bank' | 'users';

function Icon({ name }: { name: IconName }) {
  const p = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'home':   return <svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>;
    case 'loans':  return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></svg>;
    case 'chart':  return <svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case 'plus':   return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>;
    case 'upload': return <svg {...p}><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>;
    case 'bank':   return <svg {...p}><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" /></svg>;
    case 'users':  return <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c1.9.7 3.1 2.6 3.5 5.5" /></svg>;
  }
}

interface Item { href: string; label: string; icon: IconName; match: (p: string) => boolean }

const WORKSPACE: Item[] = [
  { href: '/admin', label: 'Today', icon: 'home', match: p => p === '/admin' },
  { href: '/admin/loans', label: 'Loans', icon: 'loans',
    match: p => p.startsWith('/admin/loans') && !p.startsWith('/admin/loans/new') },
  { href: '/admin/insights', label: 'Insights', icon: 'chart', match: p => p.startsWith('/admin/insights') },
];
const MANAGE: Item[] = [
  { href: '/admin/loans/new', label: 'New loan', icon: 'plus', match: p => p.startsWith('/admin/loans/new') },
  { href: '/admin/import', label: 'Import', icon: 'upload', match: p => p.startsWith('/admin/import') },
  { href: '/admin/lenders', label: 'Lenders', icon: 'bank', match: p => p.startsWith('/admin/lenders') },
  { href: '/admin/users', label: 'Users', icon: 'users', match: p => p.startsWith('/admin/users') },
];

function Brand() {
  return (
    <Link href="/admin" className="side-brand">
      <Monogram height={40} />
      <span className="wm"><b>JAY CAPITAL</b><span>FUNDING</span></span>
    </Link>
  );
}

export default function AdminShell({
  isAdmin, role, name, children,
}: { isAdmin: boolean; role: string; name: string; children: React.ReactNode }) {
  const pathname = usePathname() || '/admin';
  const [open, setOpen] = useState(false);

  // Close the drawer whenever a link takes you somewhere.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Turning a phone or tablet sideways (or resizing the window) never leaves
  // the menu standing open on its own.
  useEffect(() => {
    // Width only: phone browsers also fire "resize" when the address bar
    // slides away, which must not close the menu mid-tap.
    let lastW = window.innerWidth;
    const shut = () => setOpen(false);
    const onResize = () => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; setOpen(false); } };
    window.addEventListener('orientationchange', shut);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('orientationchange', shut);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Escape closes the drawer on a phone or tablet with a keyboard.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const initial = (name || '?').trim().charAt(0).toUpperCase();

  const link = (it: Item) => (
    <Link key={it.href} href={it.href} className={`side-link${it.match(pathname) ? ' on' : ''}`}
      aria-current={it.match(pathname) ? 'page' : undefined}>
      <Icon name={it.icon} />{it.label}
    </Link>
  );

  return (
    <div className={`shell${open ? ' open' : ''}`}>
      <header className="topbar">
        <button type="button" className="menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <Brand />
      </header>

      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />

      <aside className="side" aria-label="Main menu">
        <div className="side-top">
          <Brand />
          <button type="button" className="side-close" aria-label="Close menu" title="Close menu"
            onClick={() => setOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>
          </button>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="side-group">
            <span className="side-label">Workspace</span>
            {WORKSPACE.map(link)}
          </div>
          {isAdmin && (
            <div className="side-group">
              <span className="side-label" style={{ paddingTop: 14 }}>Manage</span>
              {MANAGE.map(link)}
            </div>
          )}
        </nav>
        <div className="side-user">
          <span className="av" aria-hidden="true">{initial}</span>
          <span className="who"><b title={name}>{name}</b><span>{role}</span></span>
          <form action="/auth/signout" method="post" style={{ margin: 0 }}>
            <button className="side-out" type="submit" aria-label="Sign out" title="Sign out">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" /></svg>
            </button>
          </form>
        </div>
      </aside>

      <div className="shell-main">{children}</div>
    </div>
  );
}
