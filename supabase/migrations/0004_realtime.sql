-- Phase 2b (realtime): let clients subscribe to live changes on shares, so a
-- player's "Shared with you" inbox updates the instant a DM sends — no refresh.
-- RLS still applies to realtime, so players only receive their own shares.
-- Run in Supabase → SQL Editor.

alter publication supabase_realtime add table public.shares;
