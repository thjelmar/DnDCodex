-- Player RSVPs for the next session (T-9, item 2). Each player records whether
-- they're coming to the DM's scheduled session (yes / no / maybe). One row per
-- player per campaign; players write only their OWN row, every member reads the
-- whole list so the DM sees a tally and players can see who's in. The row is
-- stamped with the session_date it answers, so when the DM reschedules the old
-- answers simply stop matching the new date (a reschedule asks for fresh RSVPs).
-- Run in Supabase → SQL Editor.

create table if not exists public.session_rsvps (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- 'yes' | 'no' | 'maybe'
  status text not null,
  -- The session date this answer is for; a later reschedule moves past it.
  session_date date,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
alter table public.session_rsvps enable row level security;

-- Any member of the campaign can read all RSVPs (DM tally + party visibility).
drop policy if exists "session_rsvps read" on public.session_rsvps;
create policy "session_rsvps read" on public.session_rsvps for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));

-- A member may create/update/remove only their OWN RSVP row.
drop policy if exists "session_rsvps write own" on public.session_rsvps;
create policy "session_rsvps write own" on public.session_rsvps for all to authenticated
  using (public.is_member(campaign_id, auth.uid()) and user_id = auth.uid())
  with check (public.is_member(campaign_id, auth.uid()) and user_id = auth.uid());

-- Live updates so the DM's tally and the party view change without a refresh.
-- REPLICA IDENTITY FULL so campaign_id is present on the OLD row for the RLS
-- check on UPDATE/DELETE events (see migration 0008 / 0011 for the same fix).
alter table public.session_rsvps replica identity full;
alter publication supabase_realtime add table public.session_rsvps;
