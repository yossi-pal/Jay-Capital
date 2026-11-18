import { createClient } from '@supabase/supabase-js';

/**
 * Next.js caches fetches by default; every read here is live data, so never cache.
 */
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input as any, { ...(init as any), cache: 'no-store' });

/**
 * Service-role client. BYPASSES ROW LEVEL SECURITY. Server-only, and only
 * ever called after the PIN check. The key lives in Vercel's settings.
 */
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('The database connection is not configured yet (SUPABASE_SERVICE_ROLE_KEY).');
  return createClient(url, key, { auth: { persistSession: false }, global: { fetch: noStoreFetch } });
}
