-- Session reminders (T-9 item #4), Phase 1 foundation.
-- A scheduled job (pg_cron, wired in a later step) periodically hits the
-- /api/reminders-tick function, which works out which members are due a
-- 1-day / 1-hour / at-start reminder for their campaign's next session and
-- records what it sent. Phase 1 delivers via the in-app bell (notifications);
-- email + web push are later phases that reuse this same ledger + prefs.
-- Run in Supabase -> SQL Editor -> New query -> Run. Idempotent.

-- The DM's timezone, stamped when they save a date, so the server can turn the
-- naive wall-clock next_time into an absolute instant to fire reminders against.
alter table public.session_schedule
  add column if not exists timezone text;

-- Per-user reminder preferences (null / missing keys = default on). Shape:
--   { "offsets":  {"day":true,"hour":true,"start":true},
--     "channels": {"inapp":true,"email":true,"push":true} }
alter table public.profiles
  add column if not exists reminder_prefs jsonb;

-- Send-once ledger: one row per (campaign, recipient, session date, offset,
-- channel) the tick has delivered, so re-runs never double-send. Keyed on the
-- session_date, so moving the session to a new date re-arms the reminders.
create table if not exists public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  session_date date not null,
  offset_kind text not null,   -- 'day' | 'hour' | 'start'
  channel text not null,       -- 'inapp' | 'email' | 'push'
  sent_at timestamptz not null default now(),
  unique (campaign_id, recipient_id, session_date, offset_kind, channel)
);

-- Service-role only (written by the reminders tick function): RLS on, no policies.
alter table public.reminder_log enable row level security;

create index if not exists reminder_log_campaign_idx
  on public.reminder_log (campaign_id, session_date);
