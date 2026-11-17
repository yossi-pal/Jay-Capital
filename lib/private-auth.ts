import { createCipheriv, createDecipheriv, createHmac, createHash, timingSafeEqual } from 'crypto';

/**
 * Sign-in for the hidden /private area (the personal web proxy).
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  THE PASSWORD IS NOT IN THIS FILE.                                   │
 * │  It lives in Vercel → Project → Settings → Environment Variables,    │
 * │  under the name:   PRIVATE_AREA_PASSWORD                             │
 * │  To change it, edit that value there and redeploy. Changing it also │
 * │  signs out every browser that was signed in.                         │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * No database and no accounts: after a correct password the browser gets a
 * signed pass (expiry time + signature made from the password). The proxy
 * accepts it until it expires.
 */
export const PRIVATE_PASSWORD_ENV = 'PRIVATE_AREA_PASSWORD';
export const PRIVATE_COOKIE = 'jc_private';
/** How long one sign-in lasts. */
export const PRIVATE_SESSION_SECONDS = 6 * 60 * 60;

function password(): string | null {
  const p = process.env[PRIVATE_PASSWORD_ENV];
  return p && p.length > 0 ? p : null;
}

export function privateAreaConfigured(): boolean {
  return password() !== null;
}

function sign(exp: string, pw: string): string {
  const key = createHash('sha256').update('jc-private-area:' + pw).digest();
  return createHmac('sha256', key).update(exp).digest('base64url');
}

function sameText(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(attempt: string): boolean {
  const pw = password();
  return pw !== null && sameText(attempt, pw);
}

/** A fresh signed pass, valid for PRIVATE_SESSION_SECONDS. */
export function issueToken(): string | null {
  const pw = password();
  if (!pw) return null;
  const exp = String(Math.floor(Date.now() / 1000) + PRIVATE_SESSION_SECONDS);
  return exp + '.' + sign(exp, pw);
}

export function tokenIsValid(token: string | undefined | null): boolean {
  const pw = password();
  if (!pw || !token) return false;
  const m = /^(\d{1,12})\.([A-Za-z0-9_-]{20,})$/.exec(token);
  if (!m) return false;
  if (Number(m[1]) < Date.now() / 1000) return false;
  return sameText(m[2], sign(m[1], pw));
}

/*
 * Scrambled addresses: the site being visited is encrypted (AES-256-GCM, key
 * made from the password) before it goes into the address bar, so the URL and
 * browser history show only random-looking characters. The same address always
 * scrambles the same way, so browser caching still works.
 */
function urlKeys(pw: string) {
  const enc = createHash('sha256').update('jc-private-url:' + pw).digest();
  const iv = createHash('sha256').update('jc-private-url-iv:' + pw).digest();
  return { enc, iv };
}

export function encryptUrl(url: string): string | null {
  const pw = password();
  if (!pw) return null;
  const k = urlKeys(pw);
  const iv = createHmac('sha256', k.iv).update(url).digest().subarray(0, 12);
  const c = createCipheriv('aes-256-gcm', k.enc, iv);
  const body = Buffer.concat([c.update(url, 'utf8'), c.final()]);
  return Buffer.concat([iv, body, c.getAuthTag()]).toString('base64url');
}

export function decryptUrl(blob: string): string | null {
  const pw = password();
  if (!pw) return null;
  try {
    const raw = Buffer.from(blob, 'base64url');
    if (raw.length < 29) return null;
    const d = createDecipheriv('aes-256-gcm', urlKeys(pw).enc, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(raw.length - 16));
    return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
