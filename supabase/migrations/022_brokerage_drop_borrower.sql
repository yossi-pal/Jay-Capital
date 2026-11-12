-- ============================================================
-- 022  Brokerage: remove the borrower field
--
-- Brokerage deals now record four things only: property address, loan
-- amount, closing date and lender. The table was empty when this was
-- written, so no information is lost. Row level security is unchanged.
-- ============================================================

alter table public.brokerage_loans drop column if exists borrower_name;
