-- ============================================================
-- 009  Payoff date on a loan
-- Already applied to production on 2026-08-25.
--
-- "Paid off" without a date leaves the ledger accruing forever, so the status
-- now carries the date interest stops at. The last billable period is the
-- month BEFORE the payoff month: interest from the 1st up to the payoff date
-- is a stub belonging on the payoff statement, and billing a whole month would
-- charge for days after the loan was settled.
-- ============================================================

alter table public.loans add column if not exists paid_off_date date;

-- create or replace view can only APPEND columns, so the existing list is
-- repeated in order with the new one at the end.
create or replace view public.loan_summary as
select
  l.id as loan_id, l.loan_number, l.property, l.loan_amount, l.acquisition,
  l.construction, l.annual_rate, l.closing_date, l.status, l.access_token,
  b.id as borrower_id, b.name as borrower_name, b.email as borrower_email,
  b.phone as borrower_phone, ld.name as lender_name,
  l.acquisition + coalesce(dr.total_draws, 0)                    as total_disbursed,
  l.loan_amount - (l.acquisition + coalesce(dr.total_draws, 0))  as remaining_draw,
  coalesce(dr.total_interest, 0)                                 as accrued_interest,
  coalesce(pm.total_paid, 0)                                     as total_paid,
  l.is_entity, l.entity_name, l.lender_id, ld.short_name as lender_short_name,
  l.paid_off_date
from public.loans l
join public.borrowers b on b.id = l.borrower_id
left join public.lenders ld on ld.id = l.lender_id
left join (
  select dd.loan_id,
    sum(dd.amount) filter (where dd.description = 'Construction Draw') as total_draws,
    sum(coalesce(dd.interest_accrued, 0))                              as total_interest
  from public.draw_details dd group by dd.loan_id
) dr on dr.loan_id = l.id
left join (
  select loan_id, sum(amount) as total_paid from public.payments group by loan_id
) pm on pm.loan_id = l.id;

alter view public.loan_summary set (security_invoker = on);

update public.loans set paid_off_date = coalesce(paid_off_date, updated_at::date, closing_date)
where status = 'paid_off' and paid_off_date is null;
