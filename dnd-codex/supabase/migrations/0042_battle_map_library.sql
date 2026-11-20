-- Run in Supabase -> SQL Editor BEFORE the PR that adds the library merges into `dev`.
-- (The dev and live sites share one database.)
--
-- Battle map library: owner-published battle map templates that any user can
-- browse (signed in or not) and copy into a campaign. Additive only: new tables,
-- one new function, one new Storage bucket. No existing table or function changes,
-- so old code keeps working against the shared database.

-- 1. Who may publish ----------------------------------------------------------
-- A tiny allowlist keyed by account id. The owner inserts their own row once
-- (see the seed at the end). No client write policy exists, so nobody can add
-- themselves.
create table if not exists public.library_publishers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.library_publishers enable row level security;

-- A signed-in user can read ONLY their own row (the client uses this to decide
-- whether to show the "Publish to library" button). No insert/update/delete policy.
drop policy if exists "library_publishers read own" on public.library_publishers;
create policy "library_publishers read own" on public.library_publishers
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Used by the RLS policies below. Takes no argument, so it cannot be used as a
-- membership oracle for other accounts.
create or replace function public.is_library_publisher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.library_publishers where user_id = auth.uid());
$$;
revoke all on function public.is_library_publisher() from public, anon;
grant execute on function public.is_library_publisher() to authenticated;

-- 2. The catalogue ------------------------------------------------------------
create table if not exists public.battle_map_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 600),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  -- Attribution. credit is shown on the card and copied into the campaign scene.
  credit text not null default '' check (char_length(credit) <= 200),
  credit_url text check (credit_url is null or credit_url ~* '^https?://'),
  license_note text not null default '' check (char_length(license_note) <= 300),
  -- draft = hidden from everyone but publishers; published = public; archived = hidden, kept.
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  -- Bumped on every republish. Storage paths include it, so old copies stay valid
  -- and a CDN never serves a stale image.
  version int not null default 1 check (version >= 1),
  -- Object paths in the `battlemap-library` bucket: '<id>/v<version>/map.webp' and 'thumb.webp'.
  map_path text not null,
  thumb_path text not null,
  width int not null check (width between 1 and 8192),
  height int not null check (height between 1 and 8192),
  bytes int not null check (bytes between 1 and 10485760),
  -- { cellPx, offsetX, offsetY } in image pixels. Same meaning as SceneGrid.
  grid jsonb not null,
  -- Derived by the publisher client for filtering ("30 x 20 squares").
  cols int not null check (cols between 1 and 400),
  rows int not null check (rows between 1 and 400),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
alter table public.battle_map_templates enable row level security;

-- Everyone, including signed-out visitors, reads PUBLISHED rows.
drop policy if exists "battle_map_templates read published" on public.battle_map_templates;
create policy "battle_map_templates read published" on public.battle_map_templates
  for select to anon, authenticated
  using (status = 'published');

-- Publishers read everything (drafts, archived) and write.
drop policy if exists "battle_map_templates publisher read" on public.battle_map_templates;
create policy "battle_map_templates publisher read" on public.battle_map_templates
  for select to authenticated
  using ((select public.is_library_publisher()));

drop policy if exists "battle_map_templates publisher insert" on public.battle_map_templates;
create policy "battle_map_templates publisher insert" on public.battle_map_templates
  for insert to authenticated
  with check ((select public.is_library_publisher()));

drop policy if exists "battle_map_templates publisher update" on public.battle_map_templates;
create policy "battle_map_templates publisher update" on public.battle_map_templates
  for update to authenticated
  using ((select public.is_library_publisher()))
  with check ((select public.is_library_publisher()));

drop policy if exists "battle_map_templates publisher delete" on public.battle_map_templates;
create policy "battle_map_templates publisher delete" on public.battle_map_templates
  for delete to authenticated
  using ((select public.is_library_publisher()));

-- Browse query: published, newest/ordered first. Tag filter uses the GIN index.
create index if not exists battle_map_templates_browse_idx
  on public.battle_map_templates (status, sort_order, published_at desc);
create index if not exists battle_map_templates_tags_idx
  on public.battle_map_templates using gin (tags);

-- Reuse the generic updated_at stamper from migration 0005.
drop trigger if exists battle_map_templates_touch on public.battle_map_templates;
create trigger battle_map_templates_touch before insert or update on public.battle_map_templates
  for each row execute function public.touch_records_updated_at();

-- 3. Storage ------------------------------------------------------------------
-- PUBLIC bucket: anyone with an object URL can fetch it, which gives CDN caching
-- and works signed out. Only publishers write. Paths use the template's random
-- UUID, so an unpublished (draft) template's URL is unguessable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('battlemap-library', 'battlemap-library', true, 10485760,
        array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "battlemap-library insert for publishers" on storage.objects;
create policy "battlemap-library insert for publishers" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'battlemap-library' and (select public.is_library_publisher()));

drop policy if exists "battlemap-library update for publishers" on storage.objects;
create policy "battlemap-library update for publishers" on storage.objects
  for update to authenticated
  using (bucket_id = 'battlemap-library' and (select public.is_library_publisher()));

drop policy if exists "battlemap-library delete for publishers" on storage.objects;
create policy "battlemap-library delete for publishers" on storage.objects
  for delete to authenticated
  using (bucket_id = 'battlemap-library' and (select public.is_library_publisher()));
-- No SELECT policy on storage.objects: public-bucket object URLs need none, and
-- leaving it off stops anyone from LISTING the bucket (drafts stay unlisted).

-- 4. Seed the publisher (run by hand, once, as a SEPARATE statement) ------------
-- Replace the placeholder with the owner's sign-in email. Never commit the real address.
-- insert into public.library_publishers (user_id)
-- select id from auth.users where lower(email) = lower('<owner email>');
