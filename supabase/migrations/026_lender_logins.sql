-- ============================================================
-- 026  Lender logins (read-only lender portal)
--
-- A lender can now sign in and see the loans they funded: the loan figures,
-- the borrower's contact details, and the draws and payments on each loan.
--
-- HOW ACCESS IS DECIDED
-- An admin adds one or more email addresses to a lender (lender_logins).
-- my_lender_ids() returns the lenders whose login row matches BOTH the
-- signed-in user's id AND their verified email, the same fail-closed rule
-- my_borrower_ids() uses (migration 005).
--
-- WHY THE EXISTING POLICIES ARE NOT TOUCHED
-- Several borrower actions treat "this user can read the loan" as "this user
-- is the borrower" (requesting a draw, the statement PDF, the portal). If
-- lenders were added to loans_read / draws_read / payments_read, a lender
-- would pass those checks too. So every existing row level security policy
-- stays exactly as it was, and lenders read their data ONLY through the four
-- lender_* functions below. Each one filters by my_lender_ids() itself and
-- returns a fixed, explicit list of columns (no access_token, no draw or
-- payment notes, which can hold internal remarks).
-- ============================================================

-- A role so sign-in routes lenders to /lender and the Users page labels them.
-- Nothing in this file compares against the new value, so it is safe to add
-- inside the same transaction.
alter type public.user_role add value if not exists 'lender';

-- ---------- who may sign in for which lender ----------
create table if not exists public.lender_logins (
  id          uuid primary key default gen_random_uuid(),
  lender_id   uuid not null references public.lenders(id) on delete cascade,
  email       text not null,
  full_name   text,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists lender_logins_lender_email_idx
  on public.lender_logins (lender_id, lower(email));
create index if not exists lender_logins_user_idx on public.lender_logins (user_id);

alter table public.lender_logins enable row level security;
revoke all on public.lender_logins from anon;
revoke all on public.lender_logins from authenticated;
grant select on public.lender_logins to authenticated;

drop policy if exists lender_logins_read on public.lender_logins;
create policy lender_logins_read on public.lender_logins
  for select using (public.is_admin());
drop policy if exists lender_logins_write on public.lender_logins;
create policy lender_logins_write on public.lender_logins
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- which lenders the signed-in user signs in for ----------
create or replace function public.my_lender_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select ll.lender_id
  from public.lender_logins ll
  where ll.user_id = auth.uid()
    and lower(ll.email) = lower(nullif(auth.jwt() ->> 'email', ''))
$$;

-- ---------- what a lender may read ----------
create or replace function public.lender_loans()
returns table (
  loan_id uuid, loan_number text, property text,
  loan_amount numeric, acquisition numeric, construction numeric, annual_rate numeric,
  closing_date date, status text, paid_off_date date,
  lender_id uuid, lender_name text,
  borrower_name text, borrower_email text, borrower_phone text,
  is_entity boolean, entity_name text,
  total_disbursed numeric, remaining_draw numeric, accrued_interest numeric, total_paid numeric,
  interest_reserve_months integer, interest_reserve_monthly numeric, interest_reserve_total numeric
)
language sql stable security definer
set search_path = public
as $$
  select s.loan_id, s.loan_number, s.property,
         s.loan_amount, s.acquisition, s.construction, s.annual_rate,
         s.closing_date, s.status, s.paid_off_date,
         s.lender_id, s.lender_name,
         s.borrower_name, s.borrower_email, s.borrower_phone,
         s.is_entity, s.entity_name,
         s.total_disbursed, s.remaining_draw, s.accrued_interest, s.total_paid,
         s.interest_reserve_months, s.interest_reserve_monthly, s.interest_reserve_total
  from public.loan_summary s
  where s.lender_id in (select public.my_lender_ids())
  order by s.loan_number
$$;

create or replace function public.lender_draws()
returns table (id uuid, loan_id uuid, draw_date date, description text, amount numeric, method text)
language sql stable security definer
set search_path = public
as $$
  select d.id, d.loan_id, d.draw_date, d.description, d.amount, d.method
  from public.draws d
  join public.loans l on l.id = d.loan_id
  where l.lender_id in (select public.my_lender_ids())
  order by d.draw_date
$$;

create or replace function public.lender_payments()
returns table (id uuid, loan_id uuid, payment_date date, amount numeric, method text)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.loan_id, p.payment_date, p.amount, p.method
  from public.payments p
  join public.loans l on l.id = p.loan_id
  where l.lender_id in (select public.my_lender_ids())
  order by p.payment_date
$$;

-- Needed only to work out what is past due, with the same ledger the
-- statements use.
create or replace function public.lender_allocations()
returns table (payment_id uuid, loan_id uuid, period_month date, amount numeric)
language sql stable security definer
set search_path = public
as $$
  select a.payment_id, a.loan_id, a.period_month, a.amount
  from public.payment_allocations a
  join public.loans l on l.id = a.loan_id
  where l.lender_id in (select public.my_lender_ids())
$$;

-- Signed-in users only; the functions return nothing for anyone who is not a
-- lender login, but anon has no reason to call them at all.
revoke execute on function public.my_lender_ids()      from public, anon;
revoke execute on function public.lender_loans()       from public, anon;
revoke execute on function public.lender_draws()       from public, anon;
revoke execute on function public.lender_payments()    from public, anon;
revoke execute on function public.lender_allocations() from public, anon;
grant execute on function public.my_lender_ids()      to authenticated;
grant execute on function public.lender_loans()       to authenticated;
grant execute on function public.lender_draws()       to authenticated;
grant execute on function public.lender_payments()    to authenticated;
grant execute on function public.lender_allocations() to authenticated;
