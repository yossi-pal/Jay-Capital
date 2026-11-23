-- ============================================================
-- 027  "Pending" loans (not closed yet)
--
-- A new loan status, 'pending', for a loan that has been set up but has not
-- closed. Nothing about how the loan works changes: interest, balances,
-- statements, draws and payments behave exactly as for an active loan, and
-- staff and admins see it everywhere as before.
--
-- The only difference is WHO can see it:
--   * a borrower cannot see a pending loan, or its draws, payments,
--     allocations or draw requests, even though it is theirs;
--   * a lender login cannot see a pending loan (the lender_* functions skip
--     it), even though they fund it.
-- Switching the loan back to Active makes it visible again immediately.
--
-- Every change below only NARROWS an existing borrower or lender branch
-- (adds "and status <> 'pending'"); the staff/admin branches are untouched.
-- ============================================================

-- ---------- allow the new value ----------
alter table public.loans drop constraint if exists loans_status_check;
alter table public.loans add constraint loans_status_check
  check (status in ('pending','active','paid_off','defaulted'));

-- ---------- borrowers: hide pending loans ----------
drop policy if exists loans_read on public.loans;
create policy loans_read on public.loans
  for select using (
    public.is_staff_or_admin()
    or (borrower_id in (select public.my_borrower_ids()) and status <> 'pending')
  );

drop policy if exists draws_read on public.draws;
create policy draws_read on public.draws
  for select using (
    public.is_staff_or_admin()
    or loan_id in (select l.id from public.loans l
                   where l.borrower_id in (select public.my_borrower_ids())
                     and l.status <> 'pending')
  );

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
  for select using (
    public.is_staff_or_admin()
    or loan_id in (select l.id from public.loans l
                   where l.borrower_id in (select public.my_borrower_ids())
                     and l.status <> 'pending')
  );

drop policy if exists payment_allocations_read on public.payment_allocations;
create policy payment_allocations_read on public.payment_allocations
  for select using (
    public.is_staff_or_admin()
    or loan_id in (select l.id from public.loans l
                   where l.borrower_id in (select public.my_borrower_ids())
                     and l.status <> 'pending')
  );

drop policy if exists draw_requests_read on public.draw_requests;
create policy draw_requests_read on public.draw_requests
  for select using (
    public.is_staff_or_admin()
    or loan_id in (select l.id from public.loans l
                   where l.borrower_id in (select public.my_borrower_ids())
                     and l.status <> 'pending')
  );

-- ---------- lenders: hide pending loans ----------
-- Same signatures and columns as migration 026; only the WHERE clauses change.
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
    and s.status <> 'pending'
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
    and l.status <> 'pending'
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
    and l.status <> 'pending'
  order by p.payment_date
$$;

create or replace function public.lender_allocations()
returns table (payment_id uuid, loan_id uuid, period_month date, amount numeric)
language sql stable security definer
set search_path = public
as $$
  select a.payment_id, a.loan_id, a.period_month, a.amount
  from public.payment_allocations a
  join public.loans l on l.id = a.loan_id
  where l.lender_id in (select public.my_lender_ids())
    and l.status <> 'pending'
$$;

-- create or replace keeps existing grants, but restate them so this file is
-- safe to read on its own.
revoke execute on function public.lender_loans()       from public, anon;
revoke execute on function public.lender_draws()       from public, anon;
revoke execute on function public.lender_payments()    from public, anon;
revoke execute on function public.lender_allocations() from public, anon;
grant execute on function public.lender_loans()       to authenticated;
grant execute on function public.lender_draws()       to authenticated;
grant execute on function public.lender_payments()    to authenticated;
grant execute on function public.lender_allocations() to authenticated;
