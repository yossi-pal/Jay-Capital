-- ============================================================
-- 012  Lender statements: interest reserve in place of construction reserves
-- NOT applied yet: needs approval before it is run.
--
-- The reserve is now a number of months of interest on the total loan
-- amount. Only the month count is stored; the dollar figure is worked out
-- from the loan's amount and rate. The old construction reserve list is
-- removed (no statement had used it).
-- ============================================================

alter table public.lender_statements
  add column if not exists interest_reserve_months integer not null default 0
  check (interest_reserve_months >= 0 and interest_reserve_months <= 60);

alter table public.lender_statements drop column if exists reserves;
