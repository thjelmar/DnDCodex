-- Carries the DM's Discord voice channel on the live session so players can see
-- the Join-voice button and the live voice roster during a session (T-43).
-- Stored as "guildId/channelId"; nullable, no backfill needed. The existing
-- owner-write / member-read policies on live_sessions cover the new column.
alter table public.live_sessions
  add column if not exists discord_voice text;
