-- ============================================================
-- 013  Closing statements (with the lender statement inside them)
-- NOT applied yet: needs approval before it is run.
--
-- One form now produces two documents: the full Closing Statement (every
-- fee, totalling to Total Closing Cost) and the Lender Statement extracted
-- from it (net wire only). So the table is renamed to what it now holds and
-- gains the broker-side fees. The one existing row keeps its points and
-- interest reserve.
--
-- Same access as before: staff and admins can read, only admins can write,
-- borrowers have no access at all.
-- ============================================================

alter table public.lender_statements rename to closing_statements;
alter policy lender_statements_read  on public.closing_statements rename to closing_statements_read;
alter policy lender_statements_write on public.closing_statements rename to closing_statements_write;
alter trigger lender_statements_touch on public.closing_statements rename to closing_statements_touch;

alter table public.closing_statements
  -- percent of the total loan amount, like the lender's points
  add column if not exists broker_fee_pct numeric(6,3) not null default 0
    check (broker_fee_pct >= 0 and broker_fee_pct <= 100),
  add column if not exists processing_fee numeric(14,2) not null default 0 check (processing_fee >= 0),
  add column if not exists legal_fee      numeric(14,2) not null default 0 check (legal_fee >= 0),
  -- [{ "label": "Appraisal", "amount": 650 }, ...]
  add column if not exists other_fees     jsonb not null default '[]'::jsonb;
