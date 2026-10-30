-- ============================================================
-- 016  Payoff letters
-- NOT applied yet: needs approval before it is run.
--
-- One payoff letter per loan, saved like the closing statement so it can be
-- reopened, edited and downloaded again. Principal, interest, the draw count
-- and the loan details are worked out from the loan, its draws and payments;
-- only what the admin chooses is stored here.
--
-- A fee of 0 is left off the letter. interest_from is null while the start
-- date follows the last payment automatically, and holds a date only when
-- the admin has changed it. wire_instructions is null while the letter uses
-- the standard wire details.
--
-- Internal only: staff and admins can read, only admins can write, and there
-- is deliberately no borrower read policy.
-- ============================================================

create table if not exists public.payoff_letters (
  id                 uuid primary key default uuid_generate_v4(),
  loan_id            uuid not null unique references public.loans(id) on delete cascade,
  issued_on          date not null,
  through_date       date not null,
  interest_from      date,
  demand_prep_fee    numeric(14,2) not null default 0 check (demand_prep_fee >= 0),
  wiring_fee         numeric(14,2) not null default 0 check (wiring_fee >= 0),
  discharge_fee      numeric(14,2) not null default 0 check (discharge_fee >= 0),
  draw_fee           numeric(14,2) not null default 0 check (draw_fee >= 0),         -- per draw
  late_fee           numeric(14,2) not null default 0 check (late_fee >= 0),
  prepayment_pct     numeric(6,3)  not null default 0 check (prepayment_pct >= 0 and prepayment_pct <= 100),  -- % of principal
  wire_instructions  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.payoff_letters enable row level security;
revoke all on public.payoff_letters from anon;

drop policy if exists payoff_letters_read on public.payoff_letters;
create policy payoff_letters_read on public.payoff_letters
  for select using (public.is_staff_or_admin());

drop policy if exists payoff_letters_write on public.payoff_letters;
create policy payoff_letters_write on public.payoff_letters
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists payoff_letters_touch on public.payoff_letters;
create trigger payoff_letters_touch before update on public.payoff_letters
  for each row execute function public.touch_updated_at();
