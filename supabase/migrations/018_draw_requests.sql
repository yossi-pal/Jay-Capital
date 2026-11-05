-- ============================================================
-- 018  Draw requests from the borrower portal
-- Already applied to production on 2026-11-05.
--
-- A borrower can ask for a construction draw from their portal. The request
-- sits here as "pending" until an admin approves it (which records an
-- ordinary row in `draws`, exactly as "Add draw" does) or declines it.
-- Nothing in this table affects interest or balances: only the draw an
-- approval creates does, and that goes through the existing draws table.
--
-- Who can see what:
--   * a borrower reads only requests on their own loans (my_borrower_ids());
--   * staff and admins read all of them;
--   * only admins can write through the API. Borrowers create and cancel
--     requests through server actions that first confirm, as the borrower,
--     that the loan is theirs. There is deliberately no borrower write policy.
-- ============================================================

create table if not exists public.draw_requests (
  id              uuid primary key default gen_random_uuid(),
  loan_id         uuid not null references public.loans(id) on delete cascade,
  amount          numeric(14,2) not null check (amount > 0),
  needed_by       date,
  note            text,
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'declined', 'cancelled')),
  requested_by    uuid,
  requested_at    timestamptz not null default now(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_note   text,
  approved_amount numeric(14,2) check (approved_amount is null or approved_amount > 0),
  draw_id         uuid references public.draws(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists draw_requests_loan_idx    on public.draw_requests (loan_id, requested_at desc);
create index if not exists draw_requests_pending_idx on public.draw_requests (status) where status = 'pending';

alter table public.draw_requests enable row level security;
revoke all on public.draw_requests from anon;

drop policy if exists draw_requests_read on public.draw_requests;
create policy draw_requests_read on public.draw_requests
  for select using (
    public.is_staff_or_admin()
    or loan_id in (select l.id from public.loans l where l.borrower_id in (select public.my_borrower_ids()))
  );

drop policy if exists draw_requests_write on public.draw_requests;
create policy draw_requests_write on public.draw_requests
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists draw_requests_touch on public.draw_requests;
create trigger draw_requests_touch before update on public.draw_requests
  for each row execute function public.touch_updated_at();
