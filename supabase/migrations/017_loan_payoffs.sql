-- ============================================================
-- 017  Loan payoffs (what was received, and the lender's payoff statement)
-- Already applied to production on 2026-11-04.
--
-- Marking a loan paid off now records the amount actually received, the late
-- fee and the discharge fee, and produces a Lender Payoff Statement. The
-- loan's own status and paid_off_date stay where they always were (on
-- `loans`); this table holds what borrowers must not see -- the amount
-- received and how it compares with the payoff letter -- which is why it is
-- separate: borrowers can read their own row of `loans`.
--
-- `figures` locks the statement's amounts and the comparison as saved, the
-- same way payoff letters do. Moving a loan back off paid off removes its row.
--
-- Internal only: staff and admins can read, only admins can write, and there
-- is deliberately no borrower read policy.
-- ============================================================

create table if not exists public.loan_payoffs (
  loan_id          uuid primary key references public.loans(id) on delete cascade,
  payoff_date      date not null,
  amount_received  numeric(14,2) not null check (amount_received >= 0),
  late_fee         numeric(14,2) not null default 0   check (late_fee >= 0),
  discharge_fee    numeric(14,2) not null default 250 check (discharge_fee >= 0),
  figures          jsonb not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.loan_payoffs enable row level security;
revoke all on public.loan_payoffs from anon;

drop policy if exists loan_payoffs_read on public.loan_payoffs;
create policy loan_payoffs_read on public.loan_payoffs
  for select using (public.is_staff_or_admin());

drop policy if exists loan_payoffs_write on public.loan_payoffs;
create policy loan_payoffs_write on public.loan_payoffs
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists loan_payoffs_touch on public.loan_payoffs;
create trigger loan_payoffs_touch before update on public.loan_payoffs
  for each row execute function public.touch_updated_at();
