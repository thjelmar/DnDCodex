-- Global (account-level) sync channel. The `records` table (migration 0005)
-- mirrors per-CAMPAIGN data; this one mirrors data that belongs to the USER and
-- is reusable ACROSS campaigns — starting with entity templates (T-8), and later
-- other global data like the generator word-lists. Same design as `records`
-- (one JSONB row per entity, last-write-wins on the client-side updatedAt, a
-- server-stamped updated_at driving a forward pull cursor), but keyed and
-- secured by owner instead of campaign. Run in Supabase → SQL Editor.

create table if not exists public.user_records (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- 'template' (first rider); more global kinds may follow (e.g. 'gentable').
  kind text not null,
  id uuid not null,
  -- The full entity as JSON (includes its own client-side updatedAt, used for
  -- last-write-wins). For a tombstone this is just { id, updatedAt }.
  data jsonb not null,
  deleted boolean not null default false,
  -- Server-stamped change marker; the client pulls rows with updated_at > cursor.
  updated_at timestamptz not null default now(),
  primary key (owner_id, kind, id)
);
alter table public.user_records enable row level security;

-- A user reads and writes only their own global rows. owner_id is part of the
-- primary key, so it is present in the default (PK) replica identity and the RLS
-- check still passes for realtime UPDATE/DELETE events — no REPLICA IDENTITY FULL
-- needed (unlike the scene tables, whose scope column wasn't in their PK).
drop policy if exists "user_records own" on public.user_records;
create policy "user_records own" on public.user_records for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Stamp updated_at = now() on every write so the pull cursor is server-driven
-- (monotonic, immune to client clock skew). Reuses the generic function from
-- migration 0005.
drop trigger if exists user_records_touch on public.user_records;
create trigger user_records_touch before insert or update on public.user_records
  for each row execute function public.touch_records_updated_at();

-- Helpful for the per-user pull query (owner_id = ? and updated_at > ?).
create index if not exists user_records_owner_updated_idx
  on public.user_records (owner_id, updated_at);

-- Live sync: clients subscribe to their own global record changes. RLS still
-- applies to realtime, so only the owner receives them. Guarded so re-running
-- the migration doesn't error if the table is already in the publication.
do $$
begin
  begin
    alter publication supabase_realtime add table public.user_records;
  exception when duplicate_object then null;
  end;
end $$;
