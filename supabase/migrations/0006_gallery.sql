-- Phase 3b: a live shared gallery. The DM shares campaign images and every
-- member of the campaign reads them live — no import step, and un-sharing
-- retracts them immediately. Run in Supabase → SQL Editor. (The "destructive"
-- warning is just the drop-policy guards.)

create table if not exists public.shared_images (
  -- Same id as the DM's local StoredImage, so the client can upsert/delete by it.
  id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  data_url text not null,
  caption text,
  width int,
  height int,
  created_at timestamptz not null default now()
);
alter table public.shared_images enable row level security;

-- The DM (campaign owner) manages their campaign's shared images.
drop policy if exists "shared_images owner" on public.shared_images;
create policy "shared_images owner" on public.shared_images for all to authenticated
  using (public.is_owner(campaign_id, auth.uid()))
  with check (public.is_owner(campaign_id, auth.uid()));

-- Any member (player) of the campaign can view the shared gallery.
drop policy if exists "shared_images read" on public.shared_images;
create policy "shared_images read" on public.shared_images for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));

-- Live updates so players see images appear/disappear without a refresh.
alter publication supabase_realtime add table public.shared_images;
