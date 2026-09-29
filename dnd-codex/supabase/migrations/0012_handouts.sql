-- Handouts ride the existing shared_images channel (image + caption, member-read,
-- live). A `kind` column distinguishes a deliberate "handout" the DM hands to
-- players from the passive gallery album (and entity portraits, which also flow
-- through this table). Existing rows default to 'gallery', so nothing changes for
-- them; handouts are inserted with kind = 'handout' and shown in their own surface.
-- No RLS or realtime changes needed — same table, already member-readable and live.

alter table public.shared_images
  add column if not exists kind text not null default 'gallery';
