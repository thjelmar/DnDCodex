-- Fix live (no-refresh) updates for player-facing shared tables.
--
-- Supabase Realtime applies RLS to postgres_changes by checking the policy
-- against the changed row. For UPDATE and DELETE it evaluates the OLD row, and
-- the OLD row only carries the columns named by the table's REPLICA IDENTITY.
-- With the default identity that's just the primary key, so a policy that keys
-- off a non-PK column can't be evaluated and the event is silently dropped.
--
-- The player read policies here are is_member(campaign_id, auth.uid()), which
-- needs campaign_id on the old row. Without this, a player sees a NEW share
-- (INSERT) live but NOT a re-push (UPDATE) or an un-share (DELETE) — those only
-- appear after a manual refresh. REPLICA IDENTITY FULL puts every column in the
-- old row so the member check passes on all events.
--
-- Cost: slightly larger WAL per write (the full old row is logged). Negligible
-- for these low-volume, DM-driven tables. Run in Supabase → SQL Editor.

alter table public.shared_entities replica identity full;
alter table public.shared_images replica identity full;

-- Idempotent safety net in case an earlier migration's publication line didn't
-- land (adding a table already in the publication errors, hence the guard).
do $$
begin
  begin
    alter publication supabase_realtime add table public.shared_entities;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.shared_images;
  exception when duplicate_object then null;
  end;
end $$;
