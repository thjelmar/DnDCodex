-- App-wide in-app notifications (T-19 Phase 2). One row per recipient per event.
-- A campaign member addresses a notification to another member of the SAME
-- campaign, stamped as themselves (actor_id = auth.uid()); the recipient reads,
-- marks read, and deletes only their OWN rows. Scheduling is the first producer
-- (session suggestions / approvals / declines / lock-in / reschedule / RSVP),
-- but `type` + `payload` keep the table reusable for any future feature.
-- Run in Supabase -> SQL Editor.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  -- Who receives it (always a member of campaign_id).
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  -- Who caused it (null if the actor's profile is later removed).
  actor_id uuid references public.profiles(id) on delete set null,
  -- Event kind, e.g. 'session_suggested' | 'session_approved' |
  -- 'session_declined' | 'session_locked' | 'session_rescheduled' | 'session_rsvp'.
  type text not null,
  -- Human-render context: { date, time, actorName, campaignName, status, ... }.
  payload jsonb not null default '{}'::jsonb,
  -- Null until the recipient opens/acknowledges it.
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;

-- A recipient reads only their own notifications.
drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own" on public.notifications for select to authenticated
  using (recipient_id = auth.uid() and public.is_member(campaign_id, auth.uid()));

-- A member may create a notification addressed to another member of the same
-- campaign, stamped as themselves. (Same trust model as party_loot: anyone in
-- the campaign can write shared rows; here the row is addressed, not self-owned.)
drop policy if exists "notifications create" on public.notifications;
create policy "notifications create" on public.notifications for insert to authenticated
  with check (
    actor_id = auth.uid()
    and public.is_member(campaign_id, auth.uid())
    and public.is_member(campaign_id, recipient_id)
  );

-- A recipient may update (mark read) only their own notifications.
drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own" on public.notifications for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- A recipient may delete (dismiss) only their own notifications.
drop policy if exists "notifications delete own" on public.notifications;
create policy "notifications delete own" on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());

-- Helpful indexes: the recipient's unread/recent feed, and cascade lookups.
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id) where read_at is null;

-- Live delivery: the recipient's bell updates the moment a row is inserted.
-- REPLICA IDENTITY FULL so recipient_id/campaign_id ride the OLD row on
-- UPDATE/DELETE events for the RLS check + the realtime column filter
-- (same fix as session_rsvps / session_candidates).
alter table public.notifications replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
