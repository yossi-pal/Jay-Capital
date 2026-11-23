-- ============================================================
-- 028  Wiring instructions for each draw request
-- NOT YET APPLIED -- waiting for approval.
--
-- Every draw request remembers where its funds should be wired. When the
-- borrower asks for a draw they pick "same as my last draw" (copied from
-- their most recent trusted instructions) or type new ones. The admin's
-- "Send to lender" email includes the request's instructions automatically.
--
-- New or changed instructions (is_new) are not trusted until an admin has
-- phoned the borrower and clicked "Confirmed by phone": changed bank details
-- are the usual route for wire fraud. Until then they are never emailed to
-- a lender. Copied instructions (is_new = false) come from trusted ones.
--
-- Admin-only. The server writes a borrower's row only after checking, as the
-- borrower, that the request's loan is theirs. Nobody else can read it,
-- including the borrower who sent it (the portal shows only "ending 1234").
-- ============================================================

create table if not exists public.draw_request_wires (
  request_id   uuid primary key references public.draw_requests(id) on delete cascade,
  instructions text not null check (length(btrim(instructions)) > 0),
  is_new       boolean not null,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.draw_request_wires enable row level security;
revoke all on public.draw_request_wires from anon;

drop policy if exists draw_request_wires_admin on public.draw_request_wires;
create policy draw_request_wires_admin on public.draw_request_wires
  for all using (public.is_admin()) with check (public.is_admin());
