-- T-55: index campaign_members by user_id.
--
-- The primary key is (campaign_id, user_id), so Postgres can use it for lookups
-- by campaign but not for lookups by user alone. Two paths filter by user_id:
--   * the "members read" RLS policy (`user_id = (select auth.uid())`), checked
--     whenever a signed-in user reads campaign_members, and
--   * the is_member(cid, uid) helper's `m.user_id = uid` predicate, when a plan
--     starts from the user rather than the campaign.
-- The app itself always filters campaign_members by campaign_id too (see
-- getCampaignMembers, getMyColor in src/auth/cloud.ts), which the primary key
-- already serves.
--
-- Safe to re-run. campaign_members is small, so a plain CREATE INDEX holds its
-- write lock for well under a second.

create index if not exists campaign_members_user_id_idx
  on public.campaign_members (user_id);
