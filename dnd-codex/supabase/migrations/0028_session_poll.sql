-- Session date poll / backup days (T-19 Phase 1). When the primary date doesn't
-- work for everyone, the DM floats backup days, players mark which they can make,
-- and players can suggest a day for the DM to approve. Two tables:
--   session_candidates  — the shared candidate days (DM backups = 'approved';
--                         player suggestions = 'proposed' until the DM approves).
--   session_availability — each member's yes/maybe/no per candidate day.
-- Builds on session_schedule (the locked primary date) + session_rsvps (the
-- primary RSVP). Run in Supabase → SQL Editor.

-- ── Candidate days ─────────────────────────────────────────────────────────
create table if not exists public.session_candidates (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  date date not null,
  -- 'approved' = a DM backup day everyone can weigh in on;
  -- 'proposed' = a player's suggested day awaiting the DM.
  status text not null default 'approved',
  -- Who suggested it (null for DM-added backups).
  suggested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, date)
);
alter table public.session_candidates enable row level security;

-- Any member reads the candidate days (backups + pending suggestions).
drop policy if exists "session_candidates read" on public.session_candidates;
create policy "session_candidates read" on public.session_candidates for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));

-- The DM (owner) manages candidate days fully: add/approve/remove.
drop policy if exists "session_candidates owner" on public.session_candidates;
create policy "session_candidates owner" on public.session_candidates for all to authenticated
  using (public.is_owner(campaign_id, auth.uid()))
  with check (public.is_owner(campaign_id, auth.uid()));

-- A member may propose a day — only their own, only as 'proposed'.
drop policy if exists "session_candidates propose" on public.session_candidates;
create policy "session_candidates propose" on public.session_candidates for insert to authenticated
  with check (
    public.is_member(campaign_id, auth.uid())
    and status = 'proposed'
    and suggested_by = auth.uid()
  );

-- ...and withdraw their own still-pending suggestion.
drop policy if exists "session_candidates unpropose" on public.session_candidates;
create policy "session_candidates unpropose" on public.session_candidates for delete to authenticated
  using (
    public.is_member(campaign_id, auth.uid())
    and status = 'proposed'
    and suggested_by = auth.uid()
  );

alter table public.session_candidates replica identity full;
-- Add to the realtime publication only if it isn't already a member (safe re-run).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_candidates'
  ) then
    alter publication supabase_realtime add table public.session_candidates;
  end if;
end $$;

-- ── Per-day availability ───────────────────────────────────────────────────
create table if not exists public.session_availability (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  -- 'yes' | 'maybe' | 'no'
  status text not null,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id, date)
);
alter table public.session_availability enable row level security;

-- Any member reads everyone's availability (so the DM tallies and players see).
drop policy if exists "session_availability read" on public.session_availability;
create policy "session_availability read" on public.session_availability for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));

-- A member writes only their own availability rows.
drop policy if exists "session_availability write own" on public.session_availability;
create policy "session_availability write own" on public.session_availability for all to authenticated
  using (public.is_member(campaign_id, auth.uid()) and user_id = auth.uid())
  with check (public.is_member(campaign_id, auth.uid()) and user_id = auth.uid());

-- The DM may clear availability rows (used when locking a date in / closing the poll).
drop policy if exists "session_availability owner clear" on public.session_availability;
create policy "session_availability owner clear" on public.session_availability for delete to authenticated
  using (public.is_owner(campaign_id, auth.uid()));

alter table public.session_availability replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_availability'
  ) then
    alter publication supabase_realtime add table public.session_availability;
  end if;
end $$;
