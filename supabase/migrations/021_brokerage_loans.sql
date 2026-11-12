-- ============================================================
-- 021  Brokerage loans (a separate list, not part of the loan system)
--
-- A simple record of brokered deals funded elsewhere: property address,
-- loan amount, closing date and borrower name. Nothing here touches
-- loans, draws, payments, statements or the borrower portal, and the
-- borrower name is plain text (no link to a borrower login).
--
-- Internal only: staff and admins can read, only admins can write, and
-- there is deliberately no borrower read policy.
-- ============================================================

create table if not exists public.brokerage_loans (
  id            uuid primary key default gen_random_uuid(),
  property      text not null check (length(trim(property)) > 0),
  loan_amount   numeric(14,2) not null check (loan_amount > 0),
  closing_date  date not null,
  borrower_name text not null check (length(trim(borrower_name)) > 0),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists brokerage_loans_closing_idx on public.brokerage_loans (closing_date desc);

alter table public.brokerage_loans enable row level security;
revoke all on public.brokerage_loans from anon;

drop policy if exists brokerage_loans_read on public.brokerage_loans;
create policy brokerage_loans_read on public.brokerage_loans
  for select using (public.is_staff_or_admin());

drop policy if exists brokerage_loans_write on public.brokerage_loans;
create policy brokerage_loans_write on public.brokerage_loans
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists brokerage_loans_touch on public.brokerage_loans;
create trigger brokerage_loans_touch before update on public.brokerage_loans
  for each row execute function public.touch_updated_at();
