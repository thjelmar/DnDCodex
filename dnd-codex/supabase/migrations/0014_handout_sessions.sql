-- Tag a shown handout with the session it was given in, so players can browse
-- the currently-shown handouts grouped/filtered by session. Set when a handout
-- is shown while a live session is running; null ("No session") otherwise. These
-- are ignored for gallery/portrait images. Additive + nullable — safe. Run in
-- Supabase → SQL Editor.

alter table public.shared_images
  add column if not exists session_id uuid,
  add column if not exists session_title text,
  add column if not exists session_date text;
