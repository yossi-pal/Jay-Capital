-- ============================================================
-- 014  Separate notes for the lender statement
-- Already applied to production on 2026-10-28.
--
-- `notes` stays as the Closing Statement's notes; `lender_notes` is new and
-- shows only on the Lender Statement. Until now one note showed on both, so
-- any existing note is copied across and neither statement loses it.
-- ============================================================

alter table public.closing_statements add column if not exists lender_notes text;

update public.closing_statements set lender_notes = notes
where lender_notes is null and notes is not null;
