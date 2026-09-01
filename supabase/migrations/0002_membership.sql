-- Phase 2a: cloud campaign registration + membership via join codes.
-- Run in Supabase → SQL Editor → New query → Run. (The "destructive" warning is
-- just the `drop policy if exists` guards, same as before — safe.)

-- A lightweight cloud record of a DM's campaign. Not full data sync yet — just
-- enough to link players and, later, deliver shares. `id` matches the DM's
-- local campaign id so the two stay in step.
create table if not exists public.campaigns (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Campaign',
  join_code text unique not null,
  created_at timestamptz not null default now()
);
alter table public.campaigns enable row level security;

-- Who's in a campaign (the DM as 'dm', players as 'player').
create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'player',
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
alter table public.campaign_members enable row level security;

-- security-definer helpers: these run as the table owner and therefore bypass
-- RLS, which is what keeps the policies below from referencing each other in a
-- recursive loop.
create or replace function public.is_member(cid uuid, uid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.campaign_members m
                 where m.campaign_id = cid and m.user_id = uid);
$$;

create or replace function public.is_owner(cid uuid, uid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.campaigns c
                 where c.id = cid and c.owner_id = uid);
$$;

-- campaigns: owner or member may read; only the owner writes.
drop policy if exists "campaigns read" on public.campaigns;
create policy "campaigns read" on public.campaigns for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id, auth.uid()));

drop policy if exists "campaigns insert" on public.campaigns;
create policy "campaigns insert" on public.campaigns for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "campaigns update" on public.campaigns;
create policy "campaigns update" on public.campaigns for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "campaigns delete" on public.campaigns;
create policy "campaigns delete" on public.campaigns for delete to authenticated
  using (owner_id = auth.uid());

-- campaign_members: visible to the owner and to members of that campaign; a
-- user can remove themselves, and the owner can remove anyone.
drop policy if exists "members read" on public.campaign_members;
create policy "members read" on public.campaign_members for select to authenticated
  using (user_id = auth.uid() or public.is_owner(campaign_id, auth.uid())
         or public.is_member(campaign_id, auth.uid()));

drop policy if exists "members delete" on public.campaign_members;
create policy "members delete" on public.campaign_members for delete to authenticated
  using (user_id = auth.uid() or public.is_owner(campaign_id, auth.uid()));

-- The owner adds members directly (themselves as 'dm', and any manual adds).
-- Players don't insert here — they go through join_campaign() below.
drop policy if exists "members insert by owner" on public.campaign_members;
create policy "members insert by owner" on public.campaign_members for insert to authenticated
  with check (public.is_owner(campaign_id, auth.uid()));

-- Joining happens through this function so players never need direct insert
-- rights and can't enumerate campaigns by guessing codes.
create or replace function public.join_campaign(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select id into cid from public.campaigns where join_code = upper(trim(code));
  if cid is null then raise exception 'Invalid join code'; end if;
  insert into public.campaign_members (campaign_id, user_id, role)
  values (cid, auth.uid(), 'player')
  on conflict (campaign_id, user_id) do nothing;
  return cid;
end;
$$;
