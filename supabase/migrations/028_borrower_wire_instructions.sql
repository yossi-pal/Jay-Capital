-- ============================================================
-- 028  Wiring instructions per borrower
-- NOT YET APPLIED -- waiting for approval.
--
-- Where a borrower's construction draws are wired. Entered by an admin on the
-- loan's Edit page and filled into the "Send to lender" draw request email.
--
-- Kept in its own table rather than on `borrowers`, because borrowers (and
-- the lender portal's borrower details) can read `borrowers`, and bank
-- account details should be visible to admins only. Admins read and write;
-- there is deliberately no policy for staff, borrowers or lenders.
-- ============================================================

create table if not exists public.borrower_wires (
  borrower_id  uuid primary key references public.borrowers(id) on delete cascade,
  instructions text not null check (length(btrim(instructions)) > 0),
  updated_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.borrower_wires enable row level security;
revoke all on public.borrower_wires from anon;

drop policy if exists borrower_wires_admin on public.borrower_wires;
create policy borrower_wires_admin on public.borrower_wires
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists borrower_wires_touch on public.borrower_wires;
create trigger borrower_wires_touch before update on public.borrower_wires
  for each row execute function public.touch_updated_at();
