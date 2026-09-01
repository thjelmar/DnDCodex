-- Phase 2b: the share inbox. A DM sends a quest/note (a SharePacket) to a
-- specific member; it lands in that player's inbox to import. Run in Supabase →
-- SQL Editor. (The "destructive" warning is just the drop-policy guards.)

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  title text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
alter table public.shares enable row level security;

-- Sender and recipient can both see a share.
drop policy if exists "shares read" on public.shares;
create policy "shares read" on public.shares for select to authenticated
  using (to_user = auth.uid() or from_user = auth.uid());

-- Only the campaign's DM can send, and only to an actual member of it.
drop policy if exists "shares insert" on public.shares;
create policy "shares insert" on public.shares for insert to authenticated
  with check (
    from_user = auth.uid()
    and public.is_owner(campaign_id, auth.uid())
    and public.is_member(campaign_id, to_user)
  );

-- The recipient marks a share consumed (imported).
drop policy if exists "shares update" on public.shares;
create policy "shares update" on public.shares for update to authenticated
  using (to_user = auth.uid()) with check (to_user = auth.uid());

-- Either party can delete it.
drop policy if exists "shares delete" on public.shares;
create policy "shares delete" on public.shares for delete to authenticated
  using (to_user = auth.uid() or from_user = auth.uid());
