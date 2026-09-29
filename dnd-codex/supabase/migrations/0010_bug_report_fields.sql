-- Extra fields for bug reports: a report type (bug / idea / question) for triage,
-- and an optional screenshot the reporter attaches (stored as a data URL — small,
-- low-volume, and it also rides along as an email attachment).

alter table public.bug_reports
  add column if not exists report_type text not null default 'bug',
  add column if not exists screenshot text;
