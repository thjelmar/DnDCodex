-- Battle map inspector upgrade (T-103). Four optional columns on the live token
-- table, all nullable and additive: old clients ignore them, and the app writes
-- them only when a DM uses the feature.
--   terrain  - terrain and cover markers on a prop: {difficult, cover, blocks}
--   cell_w   - footprint width in cells for a prop that is not square
--   cell_h   - footprint height in cells
--   speed_ft - manual walking speed, sent only for a player-controlled token so
--              that player's range ring works (never sent for monsters)
-- Hidden tokens are still never uploaded. Run in Supabase -> SQL Editor.

alter table public.shared_scene_tokens add column if not exists terrain jsonb;
alter table public.shared_scene_tokens add column if not exists cell_w integer;
alter table public.shared_scene_tokens add column if not exists cell_h integer;
alter table public.shared_scene_tokens add column if not exists speed_ft integer;
