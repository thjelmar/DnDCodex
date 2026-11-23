-- T-94: detail maps for the shared world map. The root map's pins stay in
-- `pins`. Detail maps ride one extra jsonb array of
-- { id, parentMapId, name, imageId, width, height, pins }.
-- Their pictures use shared_images (kind = 'worldmap'), like the root picture.
-- Additive: old clients ignore the column, and the existing owner-write and
-- member-read policies cover it. Run in Supabase -> SQL Editor.

alter table public.shared_world_maps
  add column if not exists detail_maps jsonb not null default '[]'::jsonb;
