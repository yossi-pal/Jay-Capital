-- ============================================================
-- 015  Lien position (first or second) on each loan
--
-- Internal only: staff and admins can read, only admins can write, and there
-- is deliberately no borrower read policy. It lives in its own table rather
-- than on `loans` because borrowers can read their own row of `loans` (and
-- of loan_summary), so a column there would reach them.
--
-- Loans that existed before this have no row, and show as "Not set" until
-- an admin picks a position on the loan's edit page.
-- ============================================================

create table if not exists public.loan_positions (
  loan_id        uuid primary key references public.loans(id) on delete cascade,
  lien_position  smallint not null check (lien_position in (1, 2)),   -- 1 = first, 2 = second
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.loan_positions enable row level security;
revoke all on public.loan_positions from anon;

drop policy if exists loan_positions_read on public.loan_positions;
create policy loan_positions_read on public.loan_positions
  for select using (public.is_staff_or_admin());

drop policy if exists loan_positions_write on public.loan_positions;
create policy loan_positions_write on public.loan_positions
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists loan_positions_touch on public.loan_positions;
create trigger loan_positions_touch before update on public.loan_positions
  for each row execute function public.touch_updated_at();
