-- Party loot & gold tracker: a shared, LIVE, member-writable ledger for a
-- campaign. Unlike every other shared table (DM writes, players read), BOTH the
-- DM and the players read AND write these — it's a collaborative party purse +
-- loot list synced over Realtime. Run in Supabase → SQL Editor.

-- One shared coin purse per campaign (full 5e coin types).
create table if not exists public.party_treasury (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  pp integer not null default 0,
  gp integer not null default 0,
  ep integer not null default 0,
  sp integer not null default 0,
  cp integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.party_treasury enable row level security;

-- Any campaign member (DM or player) may read and write the purse.
drop policy if exists "party_treasury member rw" on public.party_treasury;
create policy "party_treasury member rw" on public.party_treasury for all to authenticated
  using (public.is_member(campaign_id, auth.uid()))
  with check (public.is_member(campaign_id, auth.uid()));

-- Shared loot items.
create table if not exists public.party_loot (
  id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null default '',
  qty integer not null default 1,
  value text not null default '',
  claimed_by text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.party_loot enable row level security;
create index if not exists party_loot_campaign_idx on public.party_loot (campaign_id, created_at);

drop policy if exists "party_loot member rw" on public.party_loot;
create policy "party_loot member rw" on public.party_loot for all to authenticated
  using (public.is_member(campaign_id, auth.uid()))
  with check (public.is_member(campaign_id, auth.uid()));

-- Live sync. REPLICA IDENTITY FULL so the RLS is_member check on the OLD row for
-- UPDATE/DELETE has campaign_id (default identity is the PK only, which would drop
-- those events for players — see migration 0008 for the same fix).
alter table public.party_treasury replica identity full;
alter table public.party_loot replica identity full;
alter publication supabase_realtime add table public.party_treasury;
alter publication supabase_realtime add table public.party_loot;
