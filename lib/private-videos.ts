import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

/**
 * Sign-in for the private videos page. It has its own username and password,
 * separate from the portal accounts, kept in Vercel environment variables
 * (never in code, since this repository is public):
 *
 *   PRIVATE_VIDEOS_USERNAME   the username
 *   PRIVATE_VIDEOS_PASSWORD   the password
 *   PRIVATE_VIDEOS_SECRET     a long random string that signs the sign-in cookie
 *
 * If any of them is missing, nobody can sign in -- the safe default.
 */
export const VIDEOS_COOKIE = 'pv_session';
const SESSION_HOURS = 12;

function secret() { return process.env.PRIVATE_VIDEOS_SECRET || ''; }

function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('hex');
}

/** Compare without leaking, through timing, how much of a guess was right. */
function same(a: string, b: string) {
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function credentialsConfigured() {
  return !!(process.env.PRIVATE_VIDEOS_USERNAME && process.env.PRIVATE_VIDEOS_PASSWORD && secret());
}

/** Username is not case-sensitive; the password is. */
export function checkCredentials(username: string, password: string) {
  if (!credentialsConfigured()) return false;
  const u = same(username.trim().toLowerCase(), process.env.PRIVATE_VIDEOS_USERNAME!.trim().toLowerCase());
  const p = same(password, process.env.PRIVATE_VIDEOS_PASSWORD!);
  return u && p;
}

/** Cookie value: "<expiry ms>.<signature>". */
export function newSessionValue() {
  const exp = String(Date.now() + SESSION_HOURS * 3600_000);
  return { value: `${exp}.${sign(exp)}`, maxAge: SESSION_HOURS * 3600 };
}

export function isVideosSignedIn() {
  if (!credentialsConfigured()) return false;
  const raw = cookies().get(VIDEOS_COOKIE)?.value;
  if (!raw) return false;
  const [exp, sig] = raw.split('.');
  if (!exp || !sig || !same(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}
