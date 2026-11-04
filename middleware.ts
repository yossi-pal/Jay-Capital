import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Refreshes the Supabase session cookie and guards /admin and /portal.
 * Statement pages (/statement/[token]) are intentionally public -- they
 * authenticate by token, not by session.
 */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const path = req.nextUrl.pathname;
  // On /admin and /portal, getSession reads the sign-in cookie (refreshing it
  // when it has expired) without a round trip to Supabase on every click. That
  // is enough for this redirect, which is a convenience: the real checks are
  // getUser in the admin layout and the portal page, and row level security on
  // every read. /login and /signup still ask Supabase, so a cookie for a
  // removed account cannot bounce between /login and /go.
  const onAuthPage = path === '/login' || path === '/signup';
  const signedIn = onAuthPage
    ? !!(await supabase.auth.getUser()).data.user
    : !!(await supabase.auth.getSession()).data.session;

  if ((path.startsWith('/admin') || path.startsWith('/portal')) && !signedIn) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (onAuthPage && signedIn) {
    const url = req.nextUrl.clone();
    url.pathname = '/go';
    url.searchParams.delete('next');
    return NextResponse.redirect(url);
  }

  return res;
}

// /signup/[token] is deliberately NOT matched: that link must work for a
// signed-out visitor arriving from their email.
export const config = { matcher: ['/admin/:path*', '/portal/:path*', '/go', '/login', '/signup'] };
