-- Calendar subscription feed: a stable per-campaign secret token that the
-- /api/calendar Pages Function checks before serving the campaign's next-session
-- .ics feed. Players subscribe once (webcal://…) and their calendar app auto-
-- refreshes when the DM changes the date — no file downloads, no OAuth. The
-- token is a capability to a date-only feed, so members may read it to build
-- their own subscribe link. Run in Supabase → SQL Editor.

create table if not exists public.campaign_calendar_tokens (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.campaign_calendar_tokens enable row level security;

-- The DM (campaign owner) creates/holds the token.
drop policy if exists "campaign_calendar_tokens owner" on public.campaign_calendar_tokens;
create policy "campaign_calendar_tokens owner" on public.campaign_calendar_tokens for all to authenticated
  using (public.is_owner(campaign_id, auth.uid()))
  with check (public.is_owner(campaign_id, auth.uid()));

-- Any member (player) can read the token to build their subscribe link.
drop policy if exists "campaign_calendar_tokens read" on public.campaign_calendar_tokens;
create policy "campaign_calendar_tokens read" on public.campaign_calendar_tokens for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));
