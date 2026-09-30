-- Ticket links: a ticket can be a follow-up of another one (T-20 follows up
-- T-5). Stored as the parent's ticket number, so the CLI and the Tickets page can
-- both use the T-numbers people see. Deleting the parent just clears the link.
--
-- Safe with older code: nothing reads or writes the column until the new code
-- deploys, and the new code only needs it when you set a link.

alter table public.bug_reports
  add column if not exists follow_up_of bigint
    references public.bug_reports (number) on delete set null;

alter table public.bug_reports
  drop constraint if exists bug_reports_follow_up_not_self,
  add constraint bug_reports_follow_up_not_self check (follow_up_of is distinct from number);

create index if not exists bug_reports_follow_up_of_idx on public.bug_reports (follow_up_of);
