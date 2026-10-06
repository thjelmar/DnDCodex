-- Player session-status indicator: the DM sets when the next session is, and
-- every member (player) reads it live to drive the header indicator (next date,
-- weekday in the session's week, game day, or rescheduled). One schedule per
-- campaign; clearing it deletes the row. A lightweight stand-in until a full
-- calendar add-on. Run in Supabase → SQL Editor. (The "destructive" warning is
-- just the drop-policy guards.)

create table if not exists public.session_schedule (
  -- One schedule per campaign, so the campaign id is the key (upsert/delete by it).
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  -- When the next session is planned (date only); the time rides alongside as text.
  next_date date,
  next_time text,
  -- The date the session was moved off of, so the indicator can say "Rescheduled to …".
  rescheduled_from date,
  updated_at timestamptz not null default now()
);
alter table public.session_schedule enable row level security;

-- The DM (campaign owner) manages their campaign's schedule.
drop policy if exists "session_schedule owner" on public.session_schedule;
create policy "session_schedule owner" on public.session_schedule for all to authenticated
  using (public.is_owner(campaign_id, auth.uid()))
  with check (public.is_owner(campaign_id, auth.uid()));

-- Any member (player) of the campaign can read the schedule.
drop policy if exists "session_schedule read" on public.session_schedule;
create policy "session_schedule read" on public.session_schedule for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));

-- Live updates so players see the next-session date change without a refresh.
alter publication supabase_realtime add table public.session_schedule;
