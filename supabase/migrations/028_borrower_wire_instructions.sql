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

-- ---------- wiring a borrower sends with a draw request ----------
-- A borrower may send new wiring instructions with a draw request. They are
-- NOT trusted until an admin confirms them by phone (changed bank details are
-- the usual route for wire fraud). Confirming copies them into
-- borrower_wires for future draws. A request with no row here uses the
-- instructions already on file.
--
-- Written only by the server after it has checked, as the borrower, that the
-- request's loan is theirs. Admins read and confirm; nobody else can read it,
-- including the borrower who sent it.
create table if not exists public.draw_request_wires (
  request_id   uuid primary key references public.draw_requests(id) on delete cascade,
  instructions text not null check (length(btrim(instructions)) > 0),
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.draw_request_wires enable row level security;
revoke all on public.draw_request_wires from anon;

drop policy if exists draw_request_wires_admin on public.draw_request_wires;
create policy draw_request_wires_admin on public.draw_request_wires
  for all using (public.is_admin()) with check (public.is_admin());
