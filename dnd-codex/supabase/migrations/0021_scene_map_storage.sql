-- Battle-map images move from base64 (records / shared_scene_maps) to a private
-- Storage bucket. shared_scenes.map_path points at the object; players read it
-- via the bucket's member-read RLS. Path convention: "<campaignId>/<imageId>.webp",
-- so foldername[1] is the campaign id the policies gate on.

insert into storage.buckets (id, name, public)
values ('battlemaps', 'battlemaps', false)
on conflict (id) do nothing;

-- Members read, owner writes — mirrors the shared_* tables.
create policy "battlemaps read for members" on storage.objects for select to authenticated
  using (bucket_id = 'battlemaps'
         and public.is_member(((storage.foldername(name))[1])::uuid, auth.uid()));

create policy "battlemaps insert for owner" on storage.objects for insert to authenticated
  with check (bucket_id = 'battlemaps'
              and public.is_owner(((storage.foldername(name))[1])::uuid, auth.uid()));

create policy "battlemaps update for owner" on storage.objects for update to authenticated
  using (bucket_id = 'battlemaps'
         and public.is_owner(((storage.foldername(name))[1])::uuid, auth.uid()));

create policy "battlemaps delete for owner" on storage.objects for delete to authenticated
  using (bucket_id = 'battlemaps'
         and public.is_owner(((storage.foldername(name))[1])::uuid, auth.uid()));

alter table public.shared_scenes add column if not exists map_path text;
