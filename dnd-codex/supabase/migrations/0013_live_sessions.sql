-- Live session signal: while the DM is running a session and has clicked
-- "Start live session", one row here tells the campaign's players a session is
-- live so they can Join. DM (owner) writes; members read. Removing the row (End
-- session) is a DELETE that must reach players over Realtime, so replica identity
-- is FULL (default identity is the PK only, which drops the campaign_id the RLS
-- old-row check needs — same fix as migrations 0008 / 0011). Run in Supabase →
-- SQL Editor.

create table if not exists public.live_sessions (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  session_id uuid,
  title text not null default '',
  session_date text not null default '',
  started_at timestamptz not null default now(),
  started_by uuid references public.profiles(id) on delete set null
);
alter table public.live_sessions enable row level security;

-- DM (campaign owner) may start/update/end; any member may read.
drop policy if exists "live_sessions owner" on public.live_sessions;
create policy "live_sessions owner" on public.live_sessions for all to authenticated
  using (public.is_owner(campaign_id, auth.uid()))
  with check (public.is_owner(campaign_id, auth.uid()));

drop policy if exists "live_sessions read" on public.live_sessions;
create policy "live_sessions read" on public.live_sessions for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));

alter table public.live_sessions replica identity full;
alter publication supabase_realtime add table public.live_sessions;
