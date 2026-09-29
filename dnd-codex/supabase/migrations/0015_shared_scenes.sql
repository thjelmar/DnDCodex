-- Live battle maps (the built-in VTT's player view). The DM picks ONE active
-- battle map per campaign and "shows it to players"; every member sees it live.
-- The DM moves everything; a player may move only the token the DM assigned to
-- them (via move_scene_token below — never by writing the table directly).
-- Hidden tokens are never uploaded, so players can't see them at all.
-- Run in Supabase → SQL Editor.

-- The active map for a campaign (one row = "players can see this map").
create table if not exists public.shared_scenes (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  scene_id uuid not null,
  name text not null default '',
  width real not null,
  height real not null,
  -- { cellPx, offsetX, offsetY, show, color }
  grid jsonb not null,
  -- shared_scene_maps.id of the map image, or null for a blank grid.
  map_image_id uuid,
  updated_at timestamptz not null default now()
);
alter table public.shared_scenes enable row level security;

-- Tokens on the active map. A player's move updates just their token's row.
create table if not exists public.shared_scene_tokens (
  id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  label text not null default '',
  color text not null default '#2563eb',
  cell_col integer not null default 0,
  cell_row integer not null default 0,
  size integer not null default 1,
  -- Small portrait thumbnail (data URL), so players see NPC portraits without
  -- access to the DM's private records.
  portrait text,
  -- The player allowed to move this token (null = DM only).
  controlled_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.shared_scene_tokens enable row level security;
create index if not exists shared_scene_tokens_campaign_idx on public.shared_scene_tokens (campaign_id);

-- Map images, kept out of the live rows (they're large and change rarely);
-- players fetch one when the active map's map_image_id changes.
create table if not exists public.shared_scene_maps (
  id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  data_url text not null,
  width real,
  height real,
  created_at timestamptz not null default now()
);
alter table public.shared_scene_maps enable row level security;

-- The DM (campaign owner) manages all three; members read.
drop policy if exists "shared_scenes owner" on public.shared_scenes;
create policy "shared_scenes owner" on public.shared_scenes for all to authenticated
  using (public.is_owner(campaign_id, auth.uid()))
  with check (public.is_owner(campaign_id, auth.uid()));
drop policy if exists "shared_scenes read" on public.shared_scenes;
create policy "shared_scenes read" on public.shared_scenes for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));

drop policy if exists "shared_scene_tokens owner" on public.shared_scene_tokens;
create policy "shared_scene_tokens owner" on public.shared_scene_tokens for all to authenticated
  using (public.is_owner(campaign_id, auth.uid()))
  with check (public.is_owner(campaign_id, auth.uid()));
drop policy if exists "shared_scene_tokens read" on public.shared_scene_tokens;
create policy "shared_scene_tokens read" on public.shared_scene_tokens for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));

drop policy if exists "shared_scene_maps owner" on public.shared_scene_maps;
create policy "shared_scene_maps owner" on public.shared_scene_maps for all to authenticated
  using (public.is_owner(campaign_id, auth.uid()))
  with check (public.is_owner(campaign_id, auth.uid()));
drop policy if exists "shared_scene_maps read" on public.shared_scene_maps;
create policy "shared_scene_maps read" on public.shared_scene_maps for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));

-- A player moves THEIR token. Security definer so players need no UPDATE policy
-- on the table (which would let them change any column of any token); this can
-- only change position, and only for a token assigned to the caller.
create or replace function public.move_scene_token(tid uuid, new_col integer, new_row integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.shared_scene_tokens
     set cell_col = new_col, cell_row = new_row, updated_at = now()
   where id = tid
     and controlled_by = auth.uid()
     and public.is_member(campaign_id, auth.uid());
  if not found then
    raise exception 'You can only move your own token.';
  end if;
end $$;
revoke all on function public.move_scene_token(uuid, integer, integer) from public;
grant execute on function public.move_scene_token(uuid, integer, integer) to authenticated;

-- Live updates. REPLICA IDENTITY FULL so the is_member check on the OLD row for
-- UPDATE/DELETE has campaign_id (see 0008). Maps aren't live (fetched on change).
alter table public.shared_scenes replica identity full;
alter table public.shared_scene_tokens replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.shared_scenes;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.shared_scene_tokens;
  exception when duplicate_object then null;
  end;
end $$;
