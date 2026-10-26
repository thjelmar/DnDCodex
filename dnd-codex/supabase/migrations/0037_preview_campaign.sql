-- Invite-link preview (T-40). A shared invite link carries a campaign's join
-- code; before actually joining, the invitee should see which campaign and DM
-- they're about to link to ("Join X, run by Y?"). A non-member can't read the
-- campaigns row under RLS, so this security-definer function returns just the
-- campaign name and the DM's display name for a valid code — no membership
-- change, no other columns. It's the read-only companion to join_campaign
-- (migration 0002). Run in Supabase -> SQL Editor.
create or replace function public.preview_campaign(code text)
returns table (name text, dm_name text)
language sql security definer set search_path = public stable as $$
  select c.name, p.display_name
  from public.campaigns c
  join public.profiles p on p.id = c.owner_id
  where c.join_code = upper(trim(code));
$$;

-- Supabase grants EXECUTE on new functions to anon + authenticated by default;
-- the invite preview is for signed-in invitees only, so revoke anon explicitly
-- (same hardening as migration 0024) and keep authenticated.
revoke all on function public.preview_campaign(text) from public, anon;
grant execute on function public.preview_campaign(text) to authenticated;
