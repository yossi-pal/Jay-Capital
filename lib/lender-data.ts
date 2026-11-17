import { serverClient } from '@/lib/supabase-server';

/**
 * Everything the lender portal shows, read AS THE SIGNED-IN USER through the
 * lender_* functions (migration 026). Each returns only loans whose lender
 * this login belongs to, with a fixed list of columns (no notes, no
 * access_token). Never swap this for the service role.
 */
export async function loadLenderData() {
  const supabase = serverClient();
  const [loans, draws, payments, allocations] = await Promise.all([
    supabase.rpc('lender_loans'),
    supabase.rpc('lender_draws'),
    supabase.rpc('lender_payments'),
    supabase.rpc('lender_allocations'),
  ]);
  return {
    loans: (loans.data ?? []) as any[],
    draws: (draws.data ?? []) as any[],
    payments: (payments.data ?? []) as any[],
    allocations: (allocations.data ?? []) as any[],
    error: loans.error || draws.error || payments.error || allocations.error || null,
  };
}
