-- Fog of war for live battle maps. The DM reveals grid cells; players see only
-- revealed cells (the rest is drawn opaque) and never a token standing entirely
-- in fog (those tokens are withheld from the pushed set, so no position leaks).
-- Stored as { enabled, revealed: ["col,row", …] } on the shown scene; null = no
-- fog (players see the whole map, the previous behaviour).
-- Run in Supabase → SQL Editor.

alter table public.shared_scenes add column if not exists fog jsonb;
