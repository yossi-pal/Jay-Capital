-- ============================================================
-- 026  Remove the old private area from the Jay Capital database
--
-- The personal Vault, Ledger and PIN moved to their own site and their own
-- Supabase project (private-vault). Nothing in this app uses these tables any
-- more. Nothing here relates to loans, borrowers or statements.
--
-- The files in the `vault` storage bucket cannot be removed from SQL; they
-- are emptied and the bucket deleted from the Supabase dashboard.
-- ============================================================

drop table if exists public.personal_ledger_entries;
drop table if exists public.personal_ledger_accounts;
drop table if exists public.vault_files;
drop table if exists public.vault_folders;
drop table if exists public.private_area;
