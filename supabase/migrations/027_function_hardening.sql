-- ============================================================
-- 027  Tighten older database functions (Supabase security advisor)
--
-- Nothing here changes what any function returns, who can see which loan,
-- or any row level security policy. It only:
--
-- 1. Pins search_path on six functions from the original schema, so a
--    function always finds the real public tables and never a same-named
--    object placed earlier on the search path. draw_interest's arithmetic is
--    untouched; only its lookup setting changes.
--
-- 2. Stops signed-out visitors (anon) calling four SECURITY DEFINER functions
--    directly through the API. None of them returns anything useful to anon
--    today, but there is no reason anon should reach them at all.
--    The two trigger functions are closed to signed-in users too: they only
--    ever run as triggers, which does not need EXECUTE.
--    current_role() and my_borrower_ids() stay callable by signed-in users,
--    because every row level security policy depends on them.
-- ============================================================

alter function public.draw_interest(numeric, numeric, date) set search_path = public;
alter function public.current_role()      set search_path = public;
alter function public.is_admin()          set search_path = public;
alter function public.is_staff_or_admin() set search_path = public;
alter function public.handle_new_user()   set search_path = public;
alter function public.touch_updated_at()  set search_path = public;

revoke execute on function public.current_role()        from public, anon;
revoke execute on function public.my_borrower_ids()     from public, anon;
grant  execute on function public.current_role()        to authenticated, service_role;
grant  execute on function public.my_borrower_ids()     to authenticated, service_role;

revoke execute on function public.handle_new_user()     from public, anon, authenticated;
revoke execute on function public.sync_profile_signin() from public, anon, authenticated;
