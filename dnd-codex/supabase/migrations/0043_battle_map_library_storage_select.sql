-- Battle map library, part 2: lets publishers delete and list their library files.
--
-- Run in Supabase -> SQL Editor BEFORE the PR that adds library publishing merges
-- into `dev`. Needs migration 0042 first (it creates the bucket and the function).
--
-- Migration 0042 gave publishers insert/update/delete policies on the
-- `battlemap-library` bucket but no select policy. Supabase Storage runs a select
-- before it deletes or lists objects, so a publisher's remove() silently deleted
-- nothing (orphan files after a failed publish, a republish, or a delete). This
-- adds that select policy, for publishers only. The public still cannot list the
-- bucket: anon and non-publishers get no select policy, and public object URLs
-- need none. Additive and idempotent.

drop policy if exists "battlemap-library select for publishers" on storage.objects;
create policy "battlemap-library select for publishers" on storage.objects
  for select to authenticated
  using (bucket_id = 'battlemap-library' and (select public.is_library_publisher()));
