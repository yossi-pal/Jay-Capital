-- ============================================================
-- 019  Interest reserve on the loan
--
-- Some loans collect several months of interest at closing (an "interest
-- reserve"). The reserve now lives on the loan itself, so the monthly
-- statements, the payoff letter and the closing statement all read the same
-- figures and nobody has to record the reserve as a payment.
--
--   interest_reserve_months   how many months the reserve covers: the months
--                             straight after the closing month (a July close
--                             with 3 months covers August, September, October)
--   interest_reserve_monthly  the amount covered each of those months. Usually
--                             the interest on the acquisition amount, but it
--                             is typed per loan. Draw interest above it is
--                             still billed to the borrower.
--
-- These are on `loans` (and loan_summary) on purpose: the borrower's own
-- statements show the reserve line, so the borrower must be able to read it.
-- It is the same figure already on their closing statement.
--
-- The one closing statement that already had a reserve keeps its figures:
-- its months are copied across, priced the way the closing statement priced
-- them (on the total loan amount).
-- ============================================================

alter table public.loans
  add column if not exists interest_reserve_months integer not null default 0
    check (interest_reserve_months >= 0 and interest_reserve_months <= 60),
  add column if not exists interest_reserve_monthly numeric(14,2) not null default 0
    check (interest_reserve_monthly >= 0);

update public.loans l
set interest_reserve_months  = cs.interest_reserve_months,
    interest_reserve_monthly = round(l.loan_amount * l.annual_rate / 12, 2)
from public.closing_statements cs
where cs.loan_id = l.id and cs.interest_reserve_months > 0 and l.interest_reserve_months = 0;

-- create or replace view can only APPEND columns, so the existing list is
-- repeated in order with the new ones at the end.
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
  l.paid_off_date,
  l.interest_reserve_months, l.interest_reserve_monthly
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

-- Without this the view would bypass row-level security.
alter view public.loan_summary set (security_invoker = on);
