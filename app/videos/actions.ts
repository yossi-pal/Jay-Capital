'use server';

import { cookies } from 'next/headers';
import type { ActionResult } from '@/lib/result';
import { VIDEOS_COOKIE, checkCredentials, credentialsConfigured, newSessionValue } from '@/lib/private-videos';

export async function videosSignIn(username: string, password: string): Promise<ActionResult> {
  if (!credentialsConfigured()) {
    return { ok: false, error: 'Sign-in for this page is not set up yet.' };
  }
  if (!checkCredentials(username, password)) {
    // A short pause makes guessing passwords slow.
    await new Promise(r => setTimeout(r, 1200));
    return { ok: false, error: 'That username or password is not right.' };
  }
  const { value, maxAge } = newSessionValue();
  cookies().set(VIDEOS_COOKIE, value, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/videos', maxAge,
  });
  return { ok: true };
}

export async function videosSignOut(): Promise<ActionResult> {
  cookies().set(VIDEOS_COOKIE, '', { path: '/videos', maxAge: 0 });
  return { ok: true };
}
