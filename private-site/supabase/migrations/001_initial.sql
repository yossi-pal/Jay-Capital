-- ============================================================
-- 001  Private site: PIN, Vault and Ledger
--
-- Everything is locked: row level security is on and there are NO policies,
-- and anon/authenticated are revoked, so nothing is readable through the
-- public API. Only the server's service-role client (after the PIN check)
-- reads or writes. The `vault` storage bucket is private with no policies.
-- ============================================================

create table if not exists public.private_area (
  id         integer primary key default 1 check (id = 1),   -- single row only
  pin_hash   text not null,
  updated_at timestamptz not null default now()
);

alter table public.private_area enable row level security;
revoke all on public.private_area from anon, authenticated;
-- Deliberately no policies: only the service role may touch this table.

create table if not exists public.vault_folders (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.vault_folders(id) on delete cascade,  -- null = top level
  name       text not null check (length(btrim(name)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vault_folders_parent_idx on public.vault_folders(parent_id);

create table if not exists public.vault_files (
  id           uuid primary key default gen_random_uuid(),
  folder_id    uuid references public.vault_folders(id) on delete cascade, -- null = top level
  name         text not null check (length(btrim(name)) between 1 and 255),
  storage_path text not null unique,          -- object key inside the `vault` bucket
  size_bytes   bigint not null default 0,
  mime_type    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists vault_files_folder_idx on public.vault_files(folder_id);

alter table public.vault_folders enable row level security;
alter table public.vault_files   enable row level security;
revoke all on public.vault_folders from anon, authenticated;
revoke all on public.vault_files   from anon, authenticated;
-- Deliberately no policies: only the service role may touch these tables.

-- Private bucket for the file contents. No size cap of its own, so the
-- project's global upload limit applies.
insert into storage.buckets (id, name, public)
values ('vault', 'vault', false)
on conflict (id) do nothing;
-- Deliberately no storage.objects policies for this bucket.

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
