-- Players end their own turn (T-104).
-- The DM's browser stays the source of truth for combat, so a player's "End turn"
-- is a request: end_my_turn() stamps the player's own active row, and the DM's
-- client advances the turn once and clears the stamp. Additive: one nullable
-- column and one function; nothing existing changes.
-- Run in Supabase -> SQL Editor.

alter table public.shared_combatants
  add column if not exists end_turn_requested_at timestamptz;

create or replace function public.end_my_turn(cid uuid, rid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.shared_combat sc
     where sc.campaign_id = cid and sc.phase = 'active' and sc.active_ids ? rid::text
  ) then
    raise exception 'It is not that character''s turn.';
  end if;
  update public.shared_combatants
     set end_turn_requested_at = now(), updated_at = now()
   where id = rid and campaign_id = cid and controlled_by = auth.uid()
     and public.is_member(cid, auth.uid());
  if not found then
    raise exception 'You can only end your own turn.';
  end if;
end $$;
revoke all on function public.end_my_turn(uuid, uuid) from public, anon;
grant execute on function public.end_my_turn(uuid, uuid) to authenticated;
