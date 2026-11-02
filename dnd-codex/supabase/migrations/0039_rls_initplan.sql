-- T-54: evaluate auth.uid() once per statement, not once per row.
--
-- A bare auth.uid() in a policy is re-run for every row Postgres checks. Wrapping
-- it as (select auth.uid()) makes Postgres treat it as an InitPlan: it runs once
-- and the result is reused. This is the fix for the Supabase performance
-- advisor's `auth_rls_initplan` warning.
--
-- This migration changes ONLY that form. Each policy below keeps the same
-- command, the same role (`to authenticated`), and the same USING / WITH CHECK
-- logic as the migration that defined it. No policy was replaced by a later
-- migration, so each one here is the current definition.
--
-- The helpers is_member() and is_owner() are unchanged. They are SECURITY
-- DEFINER (so they bypass RLS and avoid policy recursion), which also means
-- Postgres can't inline them: they still run once per candidate row. Wrapping
-- their uid argument in (select auth.uid()) is what removes the repeated
-- auth.uid() work; their own lookups already use the campaign_members and
-- campaigns primary keys.
--
-- Safe to re-run: every policy is dropped (if it exists) and recreated.
-- Run in Supabase -> SQL Editor. The "destructive operation" banner is the
-- `drop policy if exists` guards.

begin;

-- 0001 profiles ---------------------------------------------------------------
drop policy if exists "users manage own profile" on public.profiles;
create policy "users manage own profile"
  on public.profiles for all
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 0002 campaigns --------------------------------------------------------------
drop policy if exists "campaigns read" on public.campaigns;
create policy "campaigns read" on public.campaigns for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_member(id, (select auth.uid())));

drop policy if exists "campaigns insert" on public.campaigns;
create policy "campaigns insert" on public.campaigns for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "campaigns update" on public.campaigns;
create policy "campaigns update" on public.campaigns for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "campaigns delete" on public.campaigns;
create policy "campaigns delete" on public.campaigns for delete to authenticated
  using (owner_id = (select auth.uid()));

-- 0002 campaign_members -------------------------------------------------------
drop policy if exists "members read" on public.campaign_members;
create policy "members read" on public.campaign_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_owner(campaign_id, (select auth.uid()))
         or public.is_member(campaign_id, (select auth.uid())));

drop policy if exists "members delete" on public.campaign_members;
create policy "members delete" on public.campaign_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_owner(campaign_id, (select auth.uid())));

drop policy if exists "members insert by owner" on public.campaign_members;
create policy "members insert by owner" on public.campaign_members for insert to authenticated
  with check (public.is_owner(campaign_id, (select auth.uid())));

-- 0003 shares -----------------------------------------------------------------
drop policy if exists "shares read" on public.shares;
create policy "shares read" on public.shares for select to authenticated
  using (to_user = (select auth.uid()) or from_user = (select auth.uid()));

drop policy if exists "shares insert" on public.shares;
create policy "shares insert" on public.shares for insert to authenticated
  with check (
    from_user = (select auth.uid())
    and public.is_owner(campaign_id, (select auth.uid()))
    and public.is_member(campaign_id, to_user)
  );

drop policy if exists "shares update" on public.shares;
create policy "shares update" on public.shares for update to authenticated
  using (to_user = (select auth.uid())) with check (to_user = (select auth.uid()));

drop policy if exists "shares delete" on public.shares;
create policy "shares delete" on public.shares for delete to authenticated
  using (to_user = (select auth.uid()) or from_user = (select auth.uid()));

-- 0005 records ----------------------------------------------------------------
drop policy if exists "records all" on public.records;
create policy "records all" on public.records for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));

-- 0006 shared_images ----------------------------------------------------------
drop policy if exists "shared_images owner" on public.shared_images;
create policy "shared_images owner" on public.shared_images for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));

drop policy if exists "shared_images read" on public.shared_images;
create policy "shared_images read" on public.shared_images for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

-- 0007 shared_entities --------------------------------------------------------
drop policy if exists "shared_entities owner" on public.shared_entities;
create policy "shared_entities owner" on public.shared_entities for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));

drop policy if exists "shared_entities read" on public.shared_entities;
create policy "shared_entities read" on public.shared_entities for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

-- 0011 party_treasury / party_loot --------------------------------------------
drop policy if exists "party_treasury member rw" on public.party_treasury;
create policy "party_treasury member rw" on public.party_treasury for all to authenticated
  using (public.is_member(campaign_id, (select auth.uid())))
  with check (public.is_member(campaign_id, (select auth.uid())));

drop policy if exists "party_loot member rw" on public.party_loot;
create policy "party_loot member rw" on public.party_loot for all to authenticated
  using (public.is_member(campaign_id, (select auth.uid())))
  with check (public.is_member(campaign_id, (select auth.uid())));

-- 0013 live_sessions ----------------------------------------------------------
drop policy if exists "live_sessions owner" on public.live_sessions;
create policy "live_sessions owner" on public.live_sessions for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));

drop policy if exists "live_sessions read" on public.live_sessions;
create policy "live_sessions read" on public.live_sessions for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

-- 0015 shared_scenes / shared_scene_tokens / shared_scene_maps ----------------
drop policy if exists "shared_scenes owner" on public.shared_scenes;
create policy "shared_scenes owner" on public.shared_scenes for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));
drop policy if exists "shared_scenes read" on public.shared_scenes;
create policy "shared_scenes read" on public.shared_scenes for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

drop policy if exists "shared_scene_tokens owner" on public.shared_scene_tokens;
create policy "shared_scene_tokens owner" on public.shared_scene_tokens for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));
drop policy if exists "shared_scene_tokens read" on public.shared_scene_tokens;
create policy "shared_scene_tokens read" on public.shared_scene_tokens for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

drop policy if exists "shared_scene_maps owner" on public.shared_scene_maps;
create policy "shared_scene_maps owner" on public.shared_scene_maps for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));
drop policy if exists "shared_scene_maps read" on public.shared_scene_maps;
create policy "shared_scene_maps read" on public.shared_scene_maps for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

-- 0021 battlemaps storage -----------------------------------------------------
drop policy if exists "battlemaps read for members" on storage.objects;
create policy "battlemaps read for members" on storage.objects for select to authenticated
  using (bucket_id = 'battlemaps'
         and public.is_member(((storage.foldername(name))[1])::uuid, (select auth.uid())));

drop policy if exists "battlemaps insert for owner" on storage.objects;
create policy "battlemaps insert for owner" on storage.objects for insert to authenticated
  with check (bucket_id = 'battlemaps'
              and public.is_owner(((storage.foldername(name))[1])::uuid, (select auth.uid())));

drop policy if exists "battlemaps update for owner" on storage.objects;
create policy "battlemaps update for owner" on storage.objects for update to authenticated
  using (bucket_id = 'battlemaps'
         and public.is_owner(((storage.foldername(name))[1])::uuid, (select auth.uid())));

drop policy if exists "battlemaps delete for owner" on storage.objects;
create policy "battlemaps delete for owner" on storage.objects for delete to authenticated
  using (bucket_id = 'battlemaps'
         and public.is_owner(((storage.foldername(name))[1])::uuid, (select auth.uid())));

-- 0023 shared_world_maps ------------------------------------------------------
drop policy if exists "shared_world_maps owner" on public.shared_world_maps;
create policy "shared_world_maps owner" on public.shared_world_maps for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));

drop policy if exists "shared_world_maps read" on public.shared_world_maps;
create policy "shared_world_maps read" on public.shared_world_maps for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

-- 0025 session_schedule -------------------------------------------------------
drop policy if exists "session_schedule owner" on public.session_schedule;
create policy "session_schedule owner" on public.session_schedule for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));

drop policy if exists "session_schedule read" on public.session_schedule;
create policy "session_schedule read" on public.session_schedule for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

-- 0026 campaign_calendar_tokens -----------------------------------------------
drop policy if exists "campaign_calendar_tokens owner" on public.campaign_calendar_tokens;
create policy "campaign_calendar_tokens owner" on public.campaign_calendar_tokens for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));

drop policy if exists "campaign_calendar_tokens read" on public.campaign_calendar_tokens;
create policy "campaign_calendar_tokens read" on public.campaign_calendar_tokens for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

-- 0027 session_rsvps ----------------------------------------------------------
drop policy if exists "session_rsvps read" on public.session_rsvps;
create policy "session_rsvps read" on public.session_rsvps for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

drop policy if exists "session_rsvps write own" on public.session_rsvps;
create policy "session_rsvps write own" on public.session_rsvps for all to authenticated
  using (public.is_member(campaign_id, (select auth.uid())) and user_id = (select auth.uid()))
  with check (public.is_member(campaign_id, (select auth.uid())) and user_id = (select auth.uid()));

-- 0028 session_candidates / session_availability ------------------------------
drop policy if exists "session_candidates read" on public.session_candidates;
create policy "session_candidates read" on public.session_candidates for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

drop policy if exists "session_candidates owner" on public.session_candidates;
create policy "session_candidates owner" on public.session_candidates for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));

drop policy if exists "session_candidates propose" on public.session_candidates;
create policy "session_candidates propose" on public.session_candidates for insert to authenticated
  with check (
    public.is_member(campaign_id, (select auth.uid()))
    and status = 'proposed'
    and suggested_by = (select auth.uid())
  );

drop policy if exists "session_candidates unpropose" on public.session_candidates;
create policy "session_candidates unpropose" on public.session_candidates for delete to authenticated
  using (
    public.is_member(campaign_id, (select auth.uid()))
    and status = 'proposed'
    and suggested_by = (select auth.uid())
  );

drop policy if exists "session_availability read" on public.session_availability;
create policy "session_availability read" on public.session_availability for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

drop policy if exists "session_availability write own" on public.session_availability;
create policy "session_availability write own" on public.session_availability for all to authenticated
  using (public.is_member(campaign_id, (select auth.uid())) and user_id = (select auth.uid()))
  with check (public.is_member(campaign_id, (select auth.uid())) and user_id = (select auth.uid()));

drop policy if exists "session_availability owner clear" on public.session_availability;
create policy "session_availability owner clear" on public.session_availability for delete to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())));

-- 0029 notifications ----------------------------------------------------------
drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own" on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and public.is_member(campaign_id, (select auth.uid())));

drop policy if exists "notifications create" on public.notifications;
create policy "notifications create" on public.notifications for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and public.is_member(campaign_id, (select auth.uid()))
    and public.is_member(campaign_id, recipient_id)
  );

drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own" on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

drop policy if exists "notifications delete own" on public.notifications;
create policy "notifications delete own" on public.notifications for delete to authenticated
  using (recipient_id = (select auth.uid()));

-- 0035 shared_scene_templates -------------------------------------------------
drop policy if exists "shared_scene_templates owner" on public.shared_scene_templates;
create policy "shared_scene_templates owner" on public.shared_scene_templates for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));

drop policy if exists "shared_scene_templates read" on public.shared_scene_templates;
create policy "shared_scene_templates read" on public.shared_scene_templates for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

-- 0036 user_records -----------------------------------------------------------
drop policy if exists "user_records own" on public.user_records;
create policy "user_records own" on public.user_records for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

commit;
