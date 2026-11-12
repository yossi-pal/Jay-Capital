-- ============================================================
-- 022  Brokerage: the borrower name is optional
--
-- A brokerage deal can now be saved without a borrower name. The app stores
-- a blank name as NULL; the existing check still stops a name made only of
-- spaces. No data changes and row level security is unchanged.
-- ============================================================

alter table public.brokerage_loans alter column borrower_name drop not null;
