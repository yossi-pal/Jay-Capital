import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { serviceClient } from '@/lib/supabase-server';

/**
 * Lock for the hidden /private area. A numeric PIN, kept (hashed) in the
 * `private_area` database table so it can be changed from inside the site and
 * the change survives updates. Until a PIN is saved, the area opens with the
 * starting PIN below.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  Starting PIN: 12345678.  Change it from the /private page after you  │
 * │  sign in. (The table has no row until the first change.)             │
 * └──────────────────────────────────────────────────────────────────────┘
 */
export const PRIVATE_COOKIE = 'jc_private';
/** How long one sign-in lasts. */
export const PRIVATE_SESSION_SECONDS = 6 * 60 * 60;
/** The PIN the area starts with, until it is changed from inside the site. */
const DEFAULT_PIN = '12345678';
const PIN_TABLE = 'private_area';

/** A PIN must be 4 to 12 digits. */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,12}$/.test(pin);
}

// --- hashing -------------------------------------------------------------

function scrypt(pin: string, salt: Buffer): Buffer {
  return scryptSync(pin, salt, 32);
}

/** Build a stored hash string "salt.hash" (both base64url). */
function makeHash(pin: string): string {
  const salt = randomBytes(16);
  return salt.toString('base64url') + '.' + scrypt(pin, salt).toString('base64url');
}

function hashMatches(stored: string, attempt: string): boolean {
  const [saltB64, hashB64] = stored.split('.');
  if (!saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const got = scrypt(attempt, Buffer.from(saltB64, 'base64url'));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

// --- reading the saved PIN ----------------------------------------------

/** The saved hash, or null when no PIN has been set yet (use the default). */
async function savedHash(): Promise<string | null> {
  try {
    const { data } = await serviceClient().from(PIN_TABLE).select('pin_hash').eq('id', 1).maybeSingle();
    return data?.pin_hash ?? null;
  } catch {
    // Table missing or database unreachable: fall back to the default PIN.
    return null;
  }
}

export async function checkPin(attempt: string): Promise<boolean> {
  const stored = await savedHash();
  if (stored) return hashMatches(stored, attempt);
  // No PIN saved yet: compare to the default, timing-safe.
  const a = createHash('sha256').update(attempt).digest();
  const b = createHash('sha256').update(DEFAULT_PIN).digest();
  return timingSafeEqual(a, b);
}

/** Save a new PIN after checking the current one. */
export async function setPin(current: string, next: string): Promise<{ ok: boolean; error?: string }> {
  if (!isValidPinFormat(next)) return { ok: false, error: 'The new PIN must be 4 to 12 digits.' };
  if (!(await checkPin(current))) {
    await new Promise(r => setTimeout(r, 1000));
    return { ok: false, error: 'The current PIN is not correct.' };
  }
  try {
    const { error } = await serviceClient()
      .from(PIN_TABLE)
      .upsert({ id: 1, pin_hash: makeHash(next), updated_at: new Date().toISOString() });
    if (error) throw error;
  } catch {
    return { ok: false, error: 'Could not save the new PIN. Please try again in a moment.' };
  }
  return { ok: true };
}

// --- the signed-in session pass -----------------------------------------
// A stateless pass: expiry time + a signature. The signing key depends on the
// current PIN, so changing the PIN signs out every browser automatically.

function sessionKey(secret: string): Buffer {
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createHash('sha256').update('jc-private-session:' + secret + ':' + pepper).digest();
}

function sign(exp: string, secret: string): string {
  return createHmac('sha256', sessionKey(secret)).update(exp).digest('base64url');
}

function sameSig(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

async function sessionSecret(): Promise<string> {
  return (await savedHash()) ?? 'default-pin:' + DEFAULT_PIN;
}

export async function issueToken(): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + PRIVATE_SESSION_SECONDS);
  return exp + '.' + sign(exp, await sessionSecret());
}

export async function tokenIsValid(token: string | undefined | null): Promise<boolean> {
  const m = /^(\d{1,12})\.([A-Za-z0-9_-]{20,})$/.exec(token ?? '');
  if (!m) return false;
  if (Number(m[1]) < Date.now() / 1000) return false;
  return sameSig(m[2], sign(m[1], await sessionSecret()));
}
