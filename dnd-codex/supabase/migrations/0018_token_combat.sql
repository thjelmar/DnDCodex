-- Combat overlay on live battle-map tokens. When a token is linked to a
-- combatant in the DM's tracker, the DM pushes a small privacy-filtered blob so
-- players see: an active-turn ring, condition markers, an ally's real HP, and
-- for enemies only the cumulative damage taken (never the enemy's HP pool).
-- Shape: { active?, conditions?, hp?, maxHp?, damageTaken? }; null = no combat.
-- Run in Supabase → SQL Editor.

alter table public.shared_scene_tokens add column if not exists combat jsonb;
