-- Custom (non-NPC) battle-map tokens (T-21, Phase A). Tokens can now carry an
-- emoji icon and render as a square as well as a circle, so DMs can drop things
-- like horses, boats and crates — not just NPC portraits. Both ride along to
-- players on the live board.
--   icon  - a single emoji shown inside the token (null = initials/portrait)
--   shape - 'circle' (default) or 'square'
-- Run in Supabase -> SQL Editor.

alter table public.shared_scene_tokens add column if not exists icon text;
alter table public.shared_scene_tokens add column if not exists shape text;
