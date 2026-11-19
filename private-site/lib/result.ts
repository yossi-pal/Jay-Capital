/**
 * Server actions RETURN this instead of throwing, because Next.js hides
 * thrown-error messages in production. The message reaches the screen.
 */
export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export function friendlyMessage(e: any): string {
  const raw = String(e?.message ?? e ?? 'Something went wrong.');
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(raw)) {
    return 'Could not reach the database. Please try again in a moment.';
  }
  return raw;
}

/** Run an action body, converting any throw into a returned error. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ok: true, ...(value as Record<string, unknown>) };
    }
    return { ok: true, data: value };
  } catch (e: any) {
    return { ok: false, error: friendlyMessage(e) };
  }
}
