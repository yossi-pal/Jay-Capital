'use server';

import { cookies } from 'next/headers';
import type { ActionResult } from '@/lib/result';
import {
  PRIVATE_COOKIE, PRIVATE_SESSION_SECONDS, checkPassword, issueToken, privateAreaConfigured,
} from '@/lib/private-auth';

export async function privateLogin(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  if (!privateAreaConfigured()) {
    return { ok: false, error: 'The password has not been set up yet (PRIVATE_AREA_PASSWORD in Vercel settings).' };
  }
  const attempt = String(form.get('password') ?? '');
  if (!checkPassword(attempt)) {
    // Slow down anyone guessing.
    await new Promise(r => setTimeout(r, 1500));
    return { ok: false, error: 'Wrong password.' };
  }
  const token = issueToken()!;
  cookies().set(PRIVATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/private',
    maxAge: PRIVATE_SESSION_SECONDS,
  });
  return { ok: true };
}

export async function privateLogout(): Promise<ActionResult> {
  cookies().delete({ name: PRIVATE_COOKIE, path: '/private' });
  return { ok: true };
}
