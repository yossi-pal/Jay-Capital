-- ============================================================
-- 025  Personal Ledger for the hidden /private area
--
-- A personal checkbook register (accounts such as "Checking" and "Gemach",
-- each with its own list of withdrawals and deposits). Nothing here relates
-- to loans, borrowers or the company portal, and it does not use
-- lib/ledger.ts or lib/interest.ts.
--
-- Who can see it:
--   * nobody through the normal API. Row level security is on and there are
--     NO policies, so borrowers, staff and admins all get zero rows. Only the
--     server's service-role client (behind the /private PIN) reads or writes.
-- ============================================================

create table if not exists public.personal_ledger_accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 60),
  opening_balance numeric(14,2) not null default 0,   -- balance before the first entry
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.personal_ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.personal_ledger_accounts(id) on delete cascade,
  seq         bigserial,                          -- keeps same-day entries in the order they were added
  entry_date  date not null,
  type        text not null default '' check (length(type) <= 40),          -- check #, Zelle, ...
  description text not null default '' check (length(description) <= 300),
  withdrawal  numeric(14,2) check (withdrawal is null or withdrawal >= 0),
  deposit     numeric(14,2) check (deposit is null or deposit >= 0),
  cleared     boolean not null default false,     -- the ✓ column
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists personal_ledger_entries_account_idx
  on public.personal_ledger_entries(account_id, entry_date, seq);

alter table public.personal_ledger_accounts enable row level security;
alter table public.personal_ledger_entries  enable row level security;
revoke all on public.personal_ledger_accounts from anon, authenticated;
revoke all on public.personal_ledger_entries  from anon, authenticated;
-- Deliberately no policies: only the service role may touch these tables.
