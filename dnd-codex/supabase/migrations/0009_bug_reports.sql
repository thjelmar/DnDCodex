-- Bug reports: user-submitted issue reports, emailed to the maintainer and kept
-- here as a durable, triageable backlog.
--
-- Rows are written ONLY by the bug-report Cloudflare Pages Function, which uses
-- the Supabase service-role key (bypasses RLS). We deliberately add NO policies:
-- with RLS enabled and no policy, anon/authenticated clients can neither read nor
-- write, so nothing is exposed to the app. View and triage reports in the
-- Supabase dashboard (Table editor), which uses the service role.

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- What the user typed.
  description text not null,
  -- Optional contact address (account email for signed-in users, or a field the
  -- reporter filled in).
  reporter_email text,
  -- The signed-in user's id, when there was one.
  user_id uuid,
  -- App location + environment captured at report time.
  route text,
  user_agent text,
  app_version text,
  -- Everything else (recent client errors, screen size, campaign context, …).
  context jsonb,
  -- Simple triage state for the backlog.
  status text not null default 'new'
);

create index if not exists bug_reports_created_at_idx on public.bug_reports (created_at desc);

alter table public.bug_reports enable row level security;
-- No policies on purpose — see the header. Only the service role reaches this table.
