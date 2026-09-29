-- Player colors for live battle maps. Each campaign member picks their own
-- color; any token the DM lets them control takes that color on every screen.
-- Stored on the membership (per campaign, so a player can differ by table).
-- Run in Supabase → SQL Editor.

alter table public.campaign_members add column if not exists color text;

-- A member sets THEIR color. Security definer so members need no UPDATE policy
-- on campaign_members (which would let them change their role). Only the color
-- of the caller's own membership can change.
create or replace function public.set_my_color(cid uuid, new_color text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if new_color is not null and new_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Color must look like #rrggbb.';
  end if;
  update public.campaign_members
     set color = new_color
   where campaign_id = cid and user_id = auth.uid();
  if not found then
    raise exception 'You are not a member of this campaign.';
  end if;
end $$;
revoke all on function public.set_my_color(uuid, text) from public;
grant execute on function public.set_my_color(uuid, text) to authenticated;

-- Live, so the DM's screen repaints a player's tokens the moment they pick a
-- color. REPLICA IDENTITY FULL for the RLS check on the OLD row (see 0008).
alter table public.campaign_members replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.campaign_members;
  exception when duplicate_object then null;
  end;
end $$;
