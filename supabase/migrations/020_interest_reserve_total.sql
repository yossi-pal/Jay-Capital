-- ============================================================
-- 020  Interest reserve: store the total collected, not a monthly amount
--
-- A reserve is collected as one sum at closing ($4,000 for 3 months), and a
-- monthly figure can't always say that exactly (3 x 1,333.33 = 3,999.99).
-- The loan now stores the total collected; the portal splits it evenly over
-- the reserve months, any leftover cent on the last month, so the months add
-- back up to exactly what was collected.
--
-- interest_reserve_monthly (from 019) is no longer used by the portal. It is
-- left in place because loan_summary includes it and a view cannot drop a
-- column without being rebuilt.
--
-- Existing reserves carry across:
--   - a reserve copied from a closing statement takes the total that closing
--     statement charged (months x the monthly interest on the total loan,
--     rounded once -- $4,000.00 for L021, not $3,999.99)
--   - any other reserve takes months x its monthly amount (L008: $16,500.00)
-- ============================================================

alter table public.loans
  add column if not exists interest_reserve_total numeric(14,2) not null default 0
    check (interest_reserve_total >= 0);

update public.loans l
set interest_reserve_total = case
  when exists (select 1 from public.closing_statements cs
               where cs.loan_id = l.id and cs.interest_reserve_months = l.interest_reserve_months)
       and l.interest_reserve_monthly = round(l.loan_amount * l.annual_rate / 12, 2)
    then round(l.loan_amount * l.annual_rate / 12 * l.interest_reserve_months, 2)
  else round(l.interest_reserve_monthly * l.interest_reserve_months, 2)
end
where l.interest_reserve_months > 0 and l.interest_reserve_total = 0;

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
  l.paid_off_date,
  l.interest_reserve_months, l.interest_reserve_monthly,
  l.interest_reserve_total
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
