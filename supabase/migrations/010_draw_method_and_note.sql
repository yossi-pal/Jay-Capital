-- ============================================================
-- 010  Method and note on construction draws
-- Already applied to production on 2026-10-28.
--
-- Draws get the same Method / Note pair payments already have, so the admin
-- Construction Draws table can read like the Payments table. `description`
-- stays: it is what marks a row as a construction draw (and so whether it
-- accrues interest), it is just no longer shown as a column.
-- ============================================================

alter table public.draws add column if not exists method text;
alter table public.draws add column if not exists note   text;

-- create or replace view can only APPEND columns, so the existing list is
-- repeated in order with the new ones at the end. security_invoker is stated
-- again so the view keeps respecting row level security.
create or replace view public.draw_details
with (security_invoker = on) as
select
  d.id, d.loan_id, d.draw_date, d.description, d.amount,
  case when d.description = 'Construction Draw'
       then public.draw_interest(d.amount, l.annual_rate, d.draw_date)
       else null::numeric end as interest_accrued,
  d.method, d.note
from public.draws d
join public.loans l on l.id = d.loan_id;
