import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Wiring instructions for draw requests (table draw_request_wires, admin only).
 *
 * Each request stores where its funds go. "Trusted" instructions are ones an
 * admin confirmed by phone, or ones copied from trusted instructions when the
 * borrower picked "same as my last draw". New, unconfirmed instructions are
 * never trusted and are never emailed to a lender.
 *
 * Call with the service client only after the caller has established, as the
 * signed-in user, that they may act for this borrower.
 */

export interface StoredWire {
  request_id: string;
  instructions: string;
  is_new: boolean;
  confirmed_at: string | null;
}

export function isTrusted(w: Pick<StoredWire, 'is_new' | 'confirmed_at'>): boolean {
  return !w.is_new || !!w.confirmed_at;
}

/** The borrower's most recent trusted instructions, across all their loans. */
export async function latestTrustedWire(svc: SupabaseClient, borrowerId: string | null | undefined): Promise<StoredWire | null> {
  if (!borrowerId) return null;
  const { data: loans } = await svc.from('loans').select('id').eq('borrower_id', borrowerId);
  const loanIds = (loans ?? []).map((l: any) => l.id);
  if (!loanIds.length) return null;
  const { data: reqs } = await svc.from('draw_requests').select('id').in('loan_id', loanIds);
  const reqIds = (reqs ?? []).map((r: any) => r.id);
  if (!reqIds.length) return null;
  const { data: wires } = await svc.from('draw_request_wires')
    .select('request_id, instructions, is_new, confirmed_at, created_at')
    .in('request_id', reqIds)
    .order('created_at', { ascending: false });
  return ((wires ?? []) as (StoredWire & { created_at: string })[]).find(isTrusted) ?? null;
}
