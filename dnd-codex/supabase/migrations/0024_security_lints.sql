-- Clears the Supabase security-advisor warnings.
--
-- Supabase's default privileges grant EXECUTE on every new public function
-- directly to anon + authenticated, so the earlier `revoke ... from public`
-- lines never actually removed anon's access. Revoke from anon explicitly.
-- Every RLS policy here is `to authenticated`, so anon never needs any of these.

-- Trigger-only: runs from the auth.users trigger, never needs to be an RPC.
-- (Trigger firing does not check the caller's EXECUTE privilege.)
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- RLS helpers: authenticated must keep EXECUTE (policies evaluate them as the
-- calling role); anon does not.
revoke all on function public.is_member(uuid, uuid) from public, anon;
revoke all on function public.is_owner(uuid, uuid) from public, anon;
grant execute on function public.is_member(uuid, uuid) to authenticated;
grant execute on function public.is_owner(uuid, uuid) to authenticated;

-- Intended RPCs for signed-in users only (called from the app).
revoke all on function public.join_campaign(text) from public, anon;
revoke all on function public.move_scene_token(uuid, integer, integer) from public, anon;
revoke all on function public.set_my_color(uuid, text) from public, anon;
grant execute on function public.join_campaign(text) to authenticated;
grant execute on function public.move_scene_token(uuid, integer, integer) to authenticated;
grant execute on function public.set_my_color(uuid, text) to authenticated;

-- Pin the trigger function's search_path (it only uses now(), a pg_catalog builtin).
alter function public.touch_records_updated_at() set search_path = '';
