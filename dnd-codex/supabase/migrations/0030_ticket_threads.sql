-- Ticket comments + commits (T-22). The single resolution_note stays as a
-- ticket's one-line "what shipped" summary; these two tables add (1) a
-- timestamped comment thread — Claude's extra notes and your own observations,
-- so a massive single note is no longer the only place to write — and (2)
-- structured commit refs shown as a collapsible list that link to GitHub.
--
-- Both mirror bug_reports: RLS ON with NO policies, so they're service-role only.
-- Reads/writes go through the /api/bug-reports function (owner-gated) or the
-- `npm run tickets` CLI (service key) — never a client key. Run in Supabase ->
-- SQL Editor.

-- A timestamped thread on a ticket. `author` labels who wrote it (e.g. 'you' or
-- 'Claude (main)'). References the ticket's human number (like follow_up_of).
create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint not null references public.bug_reports(number) on delete cascade,
  author text not null default 'you',
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists ticket_comments_ticket_idx
  on public.ticket_comments (ticket_number, created_at);
alter table public.ticket_comments enable row level security;
-- No policies on purpose: service-role only (same model as bug_reports).

-- Structured commit refs on a ticket (sha + optional subject), shown as a
-- collapsible list; each links to the GitHub commit page. Unique per ticket so
-- recording the same commit twice is a no-op.
create table if not exists public.ticket_commits (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint not null references public.bug_reports(number) on delete cascade,
  sha text not null,
  subject text,
  created_at timestamptz not null default now(),
  unique (ticket_number, sha)
);
create index if not exists ticket_commits_ticket_idx
  on public.ticket_commits (ticket_number, created_at);
alter table public.ticket_commits enable row level security;
-- No policies on purpose: service-role only.
