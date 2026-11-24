-- Map pings and colored cursors (T-102).
-- Pings ride Supabase Realtime Broadcast on a PRIVATE channel named
-- "pings:<campaign uuid>". Broadcast writes nothing to a table; these two
-- policies on realtime.messages decide who may join (select) and send (insert).
-- Only campaign members and the owner pass. Additive: no table, column, or
-- function changes, so there is no SECURITY DEFINER function to revoke from anon.
-- Run this in the Supabase SQL Editor.

drop policy if exists "campaign members receive map pings" on realtime.messages;
create policy "campaign members receive map pings"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) like 'pings:%'
  and (
    public.is_member(substr((select realtime.topic()), 7)::uuid, (select auth.uid()))
    or public.is_owner(substr((select realtime.topic()), 7)::uuid, (select auth.uid()))
  )
);

drop policy if exists "campaign members send map pings" on realtime.messages;
create policy "campaign members send map pings"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) like 'pings:%'
  and (
    public.is_member(substr((select realtime.topic()), 7)::uuid, (select auth.uid()))
    or public.is_owner(substr((select realtime.topic()), 7)::uuid, (select auth.uid()))
  )
);
