-- Battle Map area templates (spell areas, cones, lines) shared with players.
-- Stored on the live scene row as JSON, like fog (0017). Non-breaking: existing
-- rows read as NULL (no templates).
alter table public.shared_scenes add column if not exists templates jsonb;
