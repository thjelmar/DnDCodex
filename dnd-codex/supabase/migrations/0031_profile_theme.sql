-- Phase: per-user appearance (theme + accent), synced on the profile so a
-- user's choice follows them across devices/browsers.
-- Run this in the Supabase dashboard → SQL Editor → New query → Run.
-- Idempotent.

-- Two nullable text columns. NULL means "use the app default" (dark / violet),
-- so existing rows need no backfill and old clients keep working.
alter table public.profiles
  add column if not exists theme text,
  add column if not exists accent text;

-- No RLS change needed: the existing "users manage own profile" policy
-- (migration 0001) already allows a user to update these columns on their own
-- row, and "profiles readable by authenticated" already allows reading them.
