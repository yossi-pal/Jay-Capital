'use server';

import { cookies } from 'next/headers';
import type { ActionResult } from '@/lib/result';
import {
  PRIVATE_COOKIE, PRIVATE_SESSION_SECONDS, checkPin, issueToken, setPin, tokenIsValid,
} from '@/lib/private-auth';

export async function privateLogin(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const attempt = String(form.get('pin') ?? '');
  let ok = false;
  try { ok = await checkPin(attempt); }
  catch (e: any) { return { ok: false, error: e?.message || 'Something went wrong.' }; }
  if (!ok) {
    // Slow down anyone guessing.
    await new Promise(r => setTimeout(r, 1500));
    return { ok: false, error: 'Wrong PIN.' };
  }
  cookies().set(PRIVATE_COOKIE, await issueToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PRIVATE_SESSION_SECONDS,
  });
  return { ok: true };
}

export async function privateLogout(): Promise<ActionResult> {
  cookies().delete({ name: PRIVATE_COOKIE, path: '/' });
  return { ok: true };
}

export async function changePin(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  // Must already be signed in.
  if (!(await tokenIsValid(cookies().get(PRIVATE_COOKIE)?.value))) {
    return { ok: false, error: 'Please sign in again.' };
  }
  const current = String(form.get('current') ?? '');
  const next = String(form.get('next') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  if (next !== confirm) return { ok: false, error: 'The two new PINs do not match.' };

  let res: { ok: boolean; error?: string };
  try { res = await setPin(current, next); }
  catch (e: any) { return { ok: false, error: e?.message || 'Something went wrong.' }; }
  if (!res.ok) return { ok: false, error: res.error };

  // Changing the PIN invalidates the old pass, so hand out a fresh one.
  cookies().set(PRIVATE_COOKIE, await issueToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PRIVATE_SESSION_SECONDS,
  });
  return { ok: true, message: 'Your PIN has been changed.' };
}
