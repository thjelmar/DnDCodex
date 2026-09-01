-- Phase 3: full campaign sync. Every entity in a campaign the user OWNS is
-- mirrored here as one JSONB row, keyed by (campaign_id, kind, id). The client
-- (Dexie) stays the source of truth; this table is a sync + backup channel so a
-- campaign follows the account across devices. Run in Supabase → SQL Editor.

-- A pure-sync campaign needs no join code (that's only for inviting players), so
-- allow campaigns.join_code to be null. Existing codes are untouched.
alter table public.campaigns alter column join_code drop not null;

create table if not exists public.records (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  -- 'campaign' | 'session' | 'location' | 'npc' | 'item' | 'note' |
  -- 'playernote' | 'rolltable' | 'image' | 'link'
  kind text not null,
  id uuid not null,
  -- The full entity as JSON (includes its own client-side updatedAt, used for
  -- last-write-wins). For a tombstone this is just { id, updatedAt }.
  data jsonb not null,
  deleted boolean not null default false,
  -- Server-stamped change marker; the client pulls rows with updated_at > cursor.
  updated_at timestamptz not null default now(),
  primary key (campaign_id, kind, id)
);
alter table public.records enable row level security;

-- Only the campaign's owner can read or write its records. Members do NOT get
-- the DM's full notebook — cross-user delivery goes through `shares` (Phase 2b).
drop policy if exists "records all" on public.records;
create policy "records all" on public.records for all to authenticated
  using (public.is_owner(campaign_id, auth.uid()))
  with check (public.is_owner(campaign_id, auth.uid()));

-- Stamp updated_at = now() on every write so the pull cursor is server-driven
-- (monotonic, immune to client clock skew).
create or replace function public.touch_records_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_records_updated_at();

-- Helpful for the per-campaign pull query (campaign_id = ? and updated_at > ?).
create index if not exists records_campaign_updated_idx
  on public.records (campaign_id, updated_at);

-- Live sync: clients subscribe to record changes for their campaigns. RLS still
-- applies to realtime, so only the owner receives them.
alter publication supabase_realtime add table public.records;
