-- ============================================================
-- 023  PIN for the hidden /private area
--
-- A single row holding the (hashed) PIN that unlocks the personal /private
-- page. Nothing here relates to loans or borrowers.
--
-- Who can see it:
--   * nobody through the normal API. Row level security is on and there are
--     NO policies, so borrowers, staff and admins all get zero rows. Only the
--     server's service-role client (which bypasses RLS) reads or writes it,
--     and the /private page is the only thing that uses it.
--
-- The PIN itself is never stored in the clear: `pin_hash` is a salted scrypt
-- hash written by the server. Until a row exists, the app falls back to the
-- starting PIN (12345678) set in code.
-- ============================================================

create table if not exists public.private_area (
  id         integer primary key default 1 check (id = 1),   -- single row only
  pin_hash   text not null,
  updated_at timestamptz not null default now()
);

alter table public.private_area enable row level security;
revoke all on public.private_area from anon, authenticated;
-- Deliberately no policies: only the service role may touch this table.
