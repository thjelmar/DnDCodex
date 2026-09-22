-- Phase 3c: live published entity sharing. The DM shares an NPC / location /
-- note / session / item; players read a live copy. Crucially this holds the
-- PUSHED SNAPSHOT (the reveal-safe fields as of the last "Push changes"), not
-- the DM's live edits — so unpushed changes (and spoilers) never reach players.
-- Run in Supabase → SQL Editor.

create table if not exists public.shared_entities (
  -- Same id as the DM's local entity, so the client can upsert/delete by it.
  id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  -- Entity kind: 'npc' | 'location' | 'note' | 'session' | 'item'.
  kind text not null,
  -- The reveal-safe snapshot: { title, subtitle?, body } with spoilers redacted.
  data jsonb not null,
  pushed_at timestamptz not null default now()
);
alter table public.shared_entities enable row level security;

-- The DM (campaign owner) manages their campaign's shared entities.
drop policy if exists "shared_entities owner" on public.shared_entities;
create policy "shared_entities owner" on public.shared_entities for all to authenticated
  using (public.is_owner(campaign_id, auth.uid()))
  with check (public.is_owner(campaign_id, auth.uid()));

-- Any member (player) of the campaign can view what's been shared.
drop policy if exists "shared_entities read" on public.shared_entities;
create policy "shared_entities read" on public.shared_entities for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));

-- Live updates so players see pushes / un-shares without a refresh.
alter publication supabase_realtime add table public.shared_entities;
