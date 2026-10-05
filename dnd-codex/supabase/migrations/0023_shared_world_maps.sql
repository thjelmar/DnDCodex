-- T-6: read-only World Map sharing. The DM shares one world map per campaign
-- and every member (player) reads it live — pins here, the map picture rides
-- the existing shared_images table (kind = 'worldmap'). Un-sharing deletes the
-- row and retracts it instantly, mirroring shared_images. Run in Supabase →
-- SQL Editor. (The "destructive" warning is just the drop-policy guards.)

create table if not exists public.shared_world_maps (
  -- One shared map per campaign, so the campaign id is the key (upsert/delete by it).
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  name text,
  -- The shared_images row id (= the DM's local StoredImage id) holding the map picture.
  image_id uuid,
  width int,
  height int,
  -- The pins: [{ id, x, y, label, color, ref }], positions as 0–1 fractions.
  pins jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.shared_world_maps enable row level security;

-- The DM (campaign owner) manages their campaign's shared world map.
drop policy if exists "shared_world_maps owner" on public.shared_world_maps;
create policy "shared_world_maps owner" on public.shared_world_maps for all to authenticated
  using (public.is_owner(campaign_id, auth.uid()))
  with check (public.is_owner(campaign_id, auth.uid()));

-- Any member (player) of the campaign can view the shared world map.
drop policy if exists "shared_world_maps read" on public.shared_world_maps;
create policy "shared_world_maps read" on public.shared_world_maps for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));

-- Live updates so players see the map / pins change (or disappear) without a refresh.
alter publication supabase_realtime add table public.shared_world_maps;
