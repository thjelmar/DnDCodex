-- Player-placed spell-area templates on the live battle map (T-21, Phase B).
-- The DM's own templates still ride shared_scenes.templates (jsonb); this table
-- holds the ones PLAYERS drop, so a player can add the visual for their own
-- spell without touching — or being clobbered by — the DM's set. Members read
-- all of a campaign's player templates; the DM (owner) can clear/remove any.
-- Writes go through the security-definer RPCs below, never the table directly.
-- Run in Supabase -> SQL Editor.

create table if not exists public.shared_scene_templates (
  id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  -- 'circle' | 'cone' | 'line'
  shape text not null,
  -- Origin in fractional grid cells (circle center, cone apex, line start).
  cell_col real not null default 0,
  cell_row real not null default 0,
  -- Radius (circle) or length (cone/line), in feet.
  size_ft real not null default 0,
  -- Aim direction in radians (cone/line); null for a circle.
  dir real,
  color text not null default '#a78bfa',
  label text,
  -- The member who placed it (so they — and only they — can edit/remove it).
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.shared_scene_templates enable row level security;
create index if not exists shared_scene_templates_campaign_idx on public.shared_scene_templates (campaign_id);

-- The DM (owner) manages/clears all; every member reads.
drop policy if exists "shared_scene_templates owner" on public.shared_scene_templates;
create policy "shared_scene_templates owner" on public.shared_scene_templates for all to authenticated
  using (public.is_owner(campaign_id, auth.uid()))
  with check (public.is_owner(campaign_id, auth.uid()));
drop policy if exists "shared_scene_templates read" on public.shared_scene_templates;
create policy "shared_scene_templates read" on public.shared_scene_templates for select to authenticated
  using (public.is_member(campaign_id, auth.uid()));

-- A member places (or re-positions) their own spell-area template. Security
-- definer so players need no INSERT policy on the table; this only writes a row
-- stamped with the caller, in a campaign they belong to, and an upsert on the
-- client-chosen id only updates a row the caller already owns.
create or replace function public.place_scene_template(
  cid uuid, tid uuid, tshape text, col real, trow real, tsize_ft real, tdir real, tcolor text, tlabel text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(cid, auth.uid()) then
    raise exception 'Not a member of this campaign.';
  end if;
  if tshape not in ('circle', 'cone', 'line') then
    raise exception 'Invalid template shape.';
  end if;
  insert into public.shared_scene_templates
      (id, campaign_id, shape, cell_col, cell_row, size_ft, dir, color, label, created_by)
  values (tid, cid, tshape, col, trow, tsize_ft, tdir, tcolor, tlabel, auth.uid())
  on conflict (id) do update
     set cell_col = excluded.cell_col,
         cell_row = excluded.cell_row,
         size_ft  = excluded.size_ft,
         dir      = excluded.dir,
         color    = excluded.color,
         label    = excluded.label
   where public.shared_scene_templates.created_by = auth.uid();
end $$;
revoke all on function public.place_scene_template(uuid, uuid, text, real, real, real, real, text, text) from public, anon;
grant execute on function public.place_scene_template(uuid, uuid, text, real, real, real, real, text, text) to authenticated;

-- Remove a template: the member who placed it, or the DM (owner) clearing up.
create or replace function public.remove_scene_template(tid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.shared_scene_templates
   where id = tid
     and (created_by = auth.uid() or public.is_owner(campaign_id, auth.uid()));
  if not found then
    raise exception 'You can only remove a template you placed.';
  end if;
end $$;
revoke all on function public.remove_scene_template(uuid) from public, anon;
grant execute on function public.remove_scene_template(uuid) to authenticated;

-- Live updates. REPLICA IDENTITY FULL so the is_member check on the OLD row for
-- UPDATE/DELETE has campaign_id (same reason as the token/scene tables).
alter table public.shared_scene_templates replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.shared_scene_templates;
  exception when duplicate_object then null;
  end;
end $$;
