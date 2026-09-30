-- Tickets: bug_reports grows into a general ticket queue. Site reports and the
-- owner's own tickets share this one table; a Claude session works through it
-- with the `npm run tickets` CLI, and a curated subset is shown on the public
-- roadmap page.
--
-- The table keeps its name (and RLS with no policies — still service-role only),
-- so the existing /api/bug-report function keeps working whether this migration
-- runs before or after the new code deploys. The public roadmap reads through the
-- /api/roadmap function, which selects only the safe columns of rows marked
-- is_public.

-- Short, human-friendly ticket numbers (shown as T-<number>). Adding an identity
-- column backfills existing rows.
alter table public.bug_reports
  add column if not exists number bigint generated always as identity;
create unique index if not exists bug_reports_number_idx on public.bug_reports (number);

alter table public.bug_reports
  -- Where it came from: 'site' (the report form) or 'owner' (added by you).
  add column if not exists source text not null default 'site',
  -- The public-facing title. Owner tickets always have one; site reports get one
  -- when you triage them (the reporter's own words stay in description).
  add column if not exists title text,
  -- 'issue' | 'enhancement' | 'feature'; null = untriaged.
  add column if not exists category text,
  -- 'urgent' | 'high' | 'medium' | 'low'; null = not yet prioritized.
  add column if not exists priority text,
  -- Shown on the public roadmap only when true.
  add column if not exists is_public boolean not null default false,
  -- What was done, and where (commit / PR).
  add column if not exists resolution_note text,
  -- Who's working on it (e.g. "Claude (main)"), set by the CLI.
  add column if not exists claimed_by text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists released_at timestamptz;

-- Owner tickets can be a title alone.
alter table public.bug_reports alter column description drop not null;

-- Categories from the old report types.
update public.bug_reports
   set category = case report_type when 'bug' then 'issue' when 'idea' then 'feature' else null end
 where category is null;

-- status becomes the progress stage:
--   reported → planned → in_progress → testing → released
-- Owner tickets skip 'reported' (their bar starts at Planned).
update public.bug_reports set status = 'reported' where status = 'new';
update public.bug_reports set status = 'released', released_at = coalesce(released_at, now()) where status = 'resolved';
alter table public.bug_reports alter column status set default 'reported';

alter table public.bug_reports
  drop constraint if exists bug_reports_status_check,
  add constraint bug_reports_status_check
    check (status in ('reported', 'planned', 'in_progress', 'testing', 'released')),
  drop constraint if exists bug_reports_source_check,
  add constraint bug_reports_source_check check (source in ('site', 'owner')),
  drop constraint if exists bug_reports_category_check,
  add constraint bug_reports_category_check
    check (category is null or category in ('issue', 'enhancement', 'feature')),
  drop constraint if exists bug_reports_priority_check,
  add constraint bug_reports_priority_check
    check (priority is null or priority in ('urgent', 'high', 'medium', 'low')),
  drop constraint if exists bug_reports_has_text_check,
  add constraint bug_reports_has_text_check check (title is not null or description is not null);
