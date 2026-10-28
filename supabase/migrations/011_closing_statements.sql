-- ============================================================
-- 011  Closing statements
-- NOT applied yet: needs approval before it is run.
--
-- One closing statement per loan. The loan amount, acquisition and
-- construction holdback are NOT copied here: the statement reads them from
-- the loan, so editing the loan keeps the statement in step. Only what the
-- loan doesn't know is stored: the lender's points (a percent of the
-- acquisition only) and any construction reserves.
--
-- Internal only. Staff and admins can read; only admins can write. There is
-- deliberately no borrower read policy, so a borrower never sees one.
-- ============================================================

create table if not exists public.closing_statements (
  id                 uuid primary key default uuid_generate_v4(),
  loan_id            uuid not null unique references public.loans(id) on delete cascade,
  lender_points_pct  numeric(6,3) not null default 0 check (lender_points_pct >= 0 and lender_points_pct <= 100),  -- 2.000 = 2%
  -- [{ "label": "Roof reserve", "amount": 15000 }, ...]
  reserves           jsonb not null default '[]'::jsonb,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.closing_statements enable row level security;

drop policy if exists closing_statements_read on public.closing_statements;
create policy closing_statements_read on public.closing_statements
  for select using (public.is_staff_or_admin());

drop policy if exists closing_statements_write on public.closing_statements;
create policy closing_statements_write on public.closing_statements
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists closing_statements_touch on public.closing_statements;
create trigger closing_statements_touch before update on public.closing_statements
  for each row execute function public.touch_updated_at();
