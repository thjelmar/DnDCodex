-- Players see the initiative order and manage their own characters (T-100).
-- The DM mirrors a privacy-filtered copy of the combat here: hidden combatants and
-- enemy HP are never uploaded (an enemy row carries at most a health marker).
-- Members read; the owner (DM) writes; a player writes only rows they own or
-- control, through join_combat(), set_combat_initiative() and leave_combat().
-- Additive: two new tables and three new functions; nothing existing changes.
-- Run in Supabase -> SQL Editor.

create table if not exists public.shared_combat (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  phase text not null default 'gathering' check (phase in ('gathering', 'active')),
  round integer not null default 1,
  active_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.shared_combat enable row level security;

create table if not exists public.shared_combatants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.shared_combat(campaign_id) on delete cascade,
  -- The player who may edit this row's initiative and remove it.
  controlled_by uuid references public.profiles(id) on delete set null,
  source text not null default 'dm' check (source in ('dm', 'player')),
  char_key text,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'enemy' check (kind in ('pc', 'ally', 'enemy')),
  initiative integer,
  sort_order integer not null default 0,
  hp integer,
  max_hp integer,
  health_marker text check (health_marker in ('injured', 'bloodied', 'deaths_door')),
  conditions jsonb not null default '[]'::jsonb,
  group_count integer,
  updated_at timestamptz not null default now()
);
alter table public.shared_combatants enable row level security;
create index if not exists shared_combatants_campaign_idx on public.shared_combatants (campaign_id);
create index if not exists shared_combatants_controller_idx on public.shared_combatants (campaign_id, controlled_by);
-- One row per player character: a re-join updates it.
create unique index if not exists shared_combatants_char_uniq
  on public.shared_combatants (campaign_id, controlled_by, char_key)
  where source = 'player' and char_key is not null;

drop policy if exists "shared_combat owner" on public.shared_combat;
create policy "shared_combat owner" on public.shared_combat for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));
drop policy if exists "shared_combat read" on public.shared_combat;
create policy "shared_combat read" on public.shared_combat for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

drop policy if exists "shared_combatants owner" on public.shared_combatants;
create policy "shared_combatants owner" on public.shared_combatants for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));
drop policy if exists "shared_combatants read" on public.shared_combatants;
create policy "shared_combatants read" on public.shared_combatants for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

-- A player joins one of their characters. If a row already exists for them (they
-- joined before, or the DM added the PC first), it updates that row's initiative
-- instead of inserting a duplicate.
create or replace function public.join_combat(
  cid uuid, pname text, init integer, hp_now integer, hp_max integer, ckey text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  clean text := trim(coalesce(pname, ''));
  rid uuid;
  rsrc text;
begin
  if uid is null or not public.is_member(cid, uid) or public.is_owner(cid, uid) then
    raise exception 'Only a player in this campaign can join.';
  end if;
  if not exists (select 1 from public.shared_combat where campaign_id = cid) then
    raise exception 'The DM has not opened initiative.';
  end if;
  if char_length(clean) not between 1 and 60 then
    raise exception 'Enter a name of 1 to 60 characters.';
  end if;
  if init is null or init not between -10 and 60 then
    raise exception 'Initiative must be between -10 and 60.';
  end if;

  select id, source into rid, rsrc from public.shared_combatants
   where campaign_id = cid and controlled_by = uid
     and ((ckey is not null and char_key = ckey) or lower(name) = lower(clean))
   order by (char_key = ckey) desc nulls last
   limit 1;

  if rid is not null then
    update public.shared_combatants
       set initiative = init,
           name = case when rsrc = 'player' then clean else name end,
           updated_at = now()
     where id = rid;
    return rid;
  end if;

  if (select count(*) from public.shared_combatants
       where campaign_id = cid and controlled_by = uid and source = 'player') >= 6 then
    raise exception 'You can add up to 6 characters.';
  end if;
  insert into public.shared_combatants
      (campaign_id, controlled_by, source, char_key, name, kind, initiative, hp, max_hp)
  values (cid, uid, 'player', coalesce(ckey, lower(clean)), clean, 'pc', init,
          least(greatest(coalesce(hp_now, 0), 0), 999), least(greatest(coalesce(hp_max, 0), 0), 999))
  returning id into rid;
  return rid;
end $$;
revoke all on function public.join_combat(uuid, text, integer, integer, integer, text) from public, anon;
grant execute on function public.join_combat(uuid, text, integer, integer, integer, text) to authenticated;

-- A player changes the initiative of a combatant they own or control, any time.
create or replace function public.set_combat_initiative(cid uuid, rid uuid, init integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if init is null or init not between -10 and 60 then
    raise exception 'Initiative must be between -10 and 60.';
  end if;
  update public.shared_combatants
     set initiative = init, updated_at = now()
   where id = rid and campaign_id = cid and controlled_by = auth.uid()
     and public.is_member(cid, auth.uid());
  if not found then
    raise exception 'You can only change your own character.';
  end if;
end $$;
revoke all on function public.set_combat_initiative(uuid, uuid, integer) from public, anon;
grant execute on function public.set_combat_initiative(uuid, uuid, integer) to authenticated;

-- A player removes a combatant they own or control.
create or replace function public.leave_combat(cid uuid, rid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.shared_combatants
   where id = rid and campaign_id = cid and controlled_by = auth.uid()
     and public.is_member(cid, auth.uid());
end $$;
revoke all on function public.leave_combat(uuid, uuid) from public, anon;
grant execute on function public.leave_combat(uuid, uuid) to authenticated;

-- Live updates. REPLICA IDENTITY FULL so DELETE events carry campaign_id for RLS (see 0008).
alter table public.shared_combat replica identity full;
alter table public.shared_combatants replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.shared_combat;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.shared_combatants;
  exception when duplicate_object then null;
  end;
end $$;
