# Players: see initiative, join combat, DM warning (T-100)

Status: design only. No app code is written. Build starts when the hub says go,
after Run Mode (PR 162, T-98) and the token delete and undo work (T-99) land on
`dev`, because all three touch `src/lib/combat.ts`, the initiative list, and
`BattleMapPage.tsx`.

Mockup: [round-2/player-initiative-mockup.html](round-2/player-initiative-mockup.html)
(player strip, Join button, DM warning dialog; demo data only).

## What the owner asked for

1. Players see the initiative order.
2. Players add their own character to the initiative.
3. The DM gets a warning when adding NPCs: everyone sees them once they appear.

## How it works today

| Piece | Today |
| --- | --- |
| Combat state | One `CombatState` in `localStorage` (`codex.combat`), exposed by `useSyncExternalStore` (`src/lib/combat.ts`). DM only. Never syncs. |
| Live map to players | `useDmLiveScene` mirrors the scene, a diff of visible tokens, and a privacy-filtered `combat` overlay per token to `shared_scenes` and `shared_scene_tokens`. Players read them over Realtime (`useLiveScene` in `src/auth/liveScene.ts`). |
| Privacy filter | `toLiveTokens` drops `hidden` tokens and fogged tokens. `tokenCombat(..., forPlayers=true)` gives allies (`isPC`, `controlledBy`, `friendly`) real HP and gives enemies only `damageTaken`. |
| Who is a player | A signed-in member in `campaign_members` (migration 0002). A player's local campaign carries `linkedCampaignId` (the cloud campaign id). `is_member` and `is_owner` are the RLS helpers. |
| Player moves | The `move_scene_token` RPC (security definer, `controlled_by = auth.uid()`), so players need no UPDATE policy. |
| Player's character | `PlayerNote.characterData: CharacterSheet` in the player's local Dexie DB (abilities, `ac`, `maxHp`, `currentHp`). It is not in Supabase. |
| Live session | `live_sessions` row (migration 0013), read through `useLiveSession`. The map and the Join voice button exist only while it exists. |
| Player routes | `/player/:campaignId/session` (`PlayerSessionPage`) holds the live board. `/player/:campaignId/battlemap` redirects there. |
| Demo | `isDemo()` short-circuits every Supabase read and write. `useDmLiveScene` sets `available = false` in the demo. |
| Monster groups (T-95) | A group in initiative is one turn slot: one `Combatant` per member with a shared `groupKey` and `groupTurn: true` (`src/lib/battleGroups.ts`). Grouping alone never enters initiative. |

Gap: combat has no cloud copy. Players cannot read it, and there is no safe way
for a player to write to it.

## Decisions

### 1. What players see

A compact **initiative strip**, built only from the revealed combatants.

- Header: **Round N**, and whose turn it is (highlighted chip, scrolls into view).
- One chip per turn slot, in order: initiative number, name, a PC or enemy
  marker, and condition pips. Players see **every revealed combatant's
  initiative number**, enemies included (owner decision).
- A chip for a character a player controls (their own, or one the DM assigned,
  such as a mount) carries a "yours" outline and an edit control for its
  initiative.
- **Allies** (`isPC`, player-controlled, `friendly`) show real HP and max HP.
  This matches `tokenCombat`.
- **Enemies** never show HP, max HP, a percentage, or AC. They show an optional
  **health marker** only (see "Health markers" later in this section).
- **Hidden combatants** are never uploaded. A combatant is hidden when its own
  `hiddenFromPlayers` flag is set (new, see section 3) or when its linked token
  has `hidden: true`. Hiding is decided on the DM's device, so a hidden row never
  reaches the cloud.
- **Groups**: the upload sends one row per group slot, never one per member.
  The chip reads "Thugs ×3" (the group's name and the count of members still in
  the order). Per-member HP, damage, and conditions stay on the DM's device. A
  group of one becomes a normal chip.
- Not shown to players: AC, dex modifier, stat blocks, DM notes, member names of a
  group, the existence of hidden combatants.

**Health markers (optional, DM opt-in).** Three separate markers, each its own
setting, all **off by default**:

| Marker | Shows when |
| --- | --- |
| Injured | HP is 50 percent of max or below |
| Bloodied | HP is 25 percent of max or below |
| Death's door | HP is under 5 percent of max (and above 0) |

- The chip shows the single most severe marker whose setting is on and whose
  threshold is met. With only Death's door on, an enemy at 40 percent shows
  nothing.
- **Where the setting lives: per campaign**, as an optional field on the
  campaign record (`combatMarkers?: { injured, bloodied, deathsDoor }`, all
  false when absent). It is non-indexed, so it needs no Dexie version. A
  campaign-wide default matches how a table plays ("we use bloodied"), survives
  between fights, and is not lost on **End combat**. A per-session or
  per-combat switch would reset too often. The combat roster header carries three
  quick toggles that write to this setting.
- **Per-combatant override (cheap):** `Combatant.showHealthMarker?: boolean | null`.
  Unset follows the campaign. `false` hides the marker for that combatant (a boss
  whose health stays a mystery). `true` shows all three levels for it. It is one
  menu item on the roster row, next to the hide toggle.
- **Never on the wire:** the DM device computes the marker from `hp` and `maxHp`
  and uploads only the state (`injured`, `bloodied`, `deaths_door`, or null). The
  upload carries no enemy HP, no percentage, and no damage total. A combatant
  with no tracked HP never gets a marker.
- **Allies** are unchanged: they show real HP, so markers do not apply.
- **Reconciling with `damageTaken` on tokens.** The existing token overlay shows
  enemies' damage taken to players. **Recommendation: the markers sit beside it,
  and this change leaves the token overlay alone.** The strip shows markers only
  and never a damage number, so the new surface adds no new leak. Retiring or
  gating `damageTaken` on tokens is a separate decision (open question 1).

Placement:

- **Player session page**: the strip sits directly above the board card (and
  above the notes when no map is on show). It is one horizontal scrolling row,
  44 px high.
- **Full screen board**: the strip overlays the top edge of the map and shares the
  existing auto-hide behavior.
- **Phone portrait**: the strip is the same scrolling row, under the page header.
- **Phone landscape (T-96, T-97)**: do not add height. The strip collapses to the
  current chip plus the next two ("Aria 17 → Grok 14 → Thug ×3"), with a tap to
  expand into a bottom sheet list. It must respect the existing safe-area
  insets and `data-bm-fs` rules. The build includes a landscape check at
  844 × 390.

The strip shows when a `shared_combat` row exists (section 4), whether or not a
battle map is on show. A live session without a map still gets the strip.

### 2. How a player joins

Responsibility is on the player first. The player's own **Join initiative** is
the primary path. The DM adding a PC is the fallback, and it never creates a
duplicate.

**The flow.** The DM presses **Ask players for initiative**. That opens the
`gathering` phase: players see **Join initiative**, and NPCs stay private. The
DM then presses **Start combat**, or skips straight to it.

1. The button sits at the right end of the strip header. It shows only when the
   DM has opened initiative.
2. Click opens a small popover: **Character** (a name field with a picker of the
   player's local sheets and an **Add another** entry), **Initiative** (prefilled
   with a d20 plus dex modifier roll, a **Reroll** button, a typed value
   allowed), and **Join**. Dex modifier comes from
   `characterData.abilities.dex`; without a sheet it is 0.
3. **Join** calls `join_combat`. The chip appears with a "yours" outline, and the
   header button becomes **Leave initiative** for that character.

**Rules**

- **No approval step.** The row is added directly. The DM sees a toast, "Aria
  joined initiative (17)", with **Remove** and **Edit**.
- **More than one character.** A player may join several characters (most play
  one). Each has a stable `char_key` (the local note id, or a slug of the name),
  so a re-join updates that character instead of adding another. A cap of 6
  player-created rows per player per campaign stops spam.
- **Editing initiative: any time.** A player may change the initiative of a
  character they own or control, before and after combat starts, through
  `set_combat_initiative`. The server checks ownership. The DM client applies the
  change, re-sorts with `resortKeepTurn`, and shows a toast with the old and new
  values ("Aria 17 → 9") so a mid-combat change is never silent.
- **Leaving.** A player may remove a character they own or control at any time
  (`leave_combat`). The DM gets a toast with **Undo**.
- **A player touches nothing else.** No other player's rows, no DM-only rows, no
  HP, conditions, order, or turn. HP stays DM-only.
- **Self-reported stats.** The player sends name, dex modifier result, HP, and max
  HP. A player could type any HP for their own character. That is acceptable
  because the DM tracks HP afterwards and sees the toast. The server clamps
  ranges.
- **No combat open:** no button. The strip area shows "No combat right now" only
  when a map is on show; otherwise nothing renders.
- **Joining while active:** allowed. The DM client inserts the character and keeps
  the turn on the same slot.

**The DM fallback and duplicates.** When the DM adds a PC to combat, the add form
has an optional **Player** picker (the campaign's members, the same list as a
token's **Controlled by**). The rules:

- The DM add is skipped, with the toast "Aria already joined", when the picked
  player already has a row with the same name, or when no name matches and the
  player has exactly one joined character and the DM did not enter a different
  name.
- A DM-added PC with a player picked is uploaded with `controlled_by` set, so
  that player may edit its initiative.
- If the DM added the PC first and the player later presses **Join**,
  `join_combat` matches the existing row by `controlled_by` plus `char_key`, or by
  the same name (case-insensitive), and updates its initiative. It never inserts a
  second row.

**NPCs assigned to players (mounts, vehicles, companions).** A combatant gets an
optional controlling player: `Combatant.controlledBy` (a member id).

- **Assigning.** On the roster row, **Controlled by** opens the member list. A
  combatant linked to a token inherits that token's existing `controlledBy`
  unless the DM sets one on the combatant explicitly, so a horse the DM already
  assigned for moving needs no second step.
- **What the controlling player can do:** see the chip with the "yours" outline;
  roll or edit its initiative at any time; **Leave** with it (the DM gets an Undo
  toast). It cannot add the NPC to combat itself. Only the DM creates NPC rows,
  so the DM re-adds it if it should come back. **HP is DM-only.** The chip shows
  real HP to everyone, because a player-controlled combatant is an ally under
  `isAllyToken`.
- **Server rule:** an assigned combatant's row carries `controlled_by`. The
  player RPCs match on `controlled_by = auth.uid()`, so a player can touch exactly
  the rows where they are the owner or the assigned controller, and nothing else.
- Assigned NPCs are still non-PC combatants, so the reveal warning (section 3)
  fires when the DM adds one.

### 3. DM warning pop-up

Dialog (modal, uses the app's existing dialog and `useDialogExit` animation):

> **Show these combatants to players?**
> Everyone in the live session will see these combatants once they appear:
> Goblin 1, Goblin 2, Grok the Ogre.
> [ ] Don't show this message again
> **Cancel** **Add**

**The warning is for the DM only.** A player never sees it, and no player-side
code may render it or call `confirmReveal`. That covers the player board, the
player session page, the **Join initiative** flow, and a controlling player who
manages an assigned NPC.

Fires on **every** add of a non-PC, non-hidden combatant when all of these hold:
the user is the DM (the campaign owner, in the DM view of the battle map, Run
Mode, or the combat tracker), a live session exists, and the combat is visible to
players. A live session alone is not enough.

**How the DM-only rule is enforced:**

- `confirmReveal` lives in `src/lib/revealGuard.ts` and takes the campaign. It
  returns true without a dialog unless `campaign.role === 'dm'` and the signed-in
  user owns the cloud campaign. Player campaigns (`role: 'player'`) never pass.
- Only DM code imports it: `CombatRoster`, `CombatTrackerPage`, the encounter
  runner, `BattleMapPage`, `GroupBox`, and Run Mode. Nothing under
  `PlayerLiveBoard`, `PlayerSessionPage`, or the new strip imports
  `revealGuard.ts` or the dialog component. An ESLint `no-restricted-imports` rule
  on `src/components/Player*`, `src/pages/Player*`, and the strip component makes
  the build fail if one does.
- The server side already blocks player adds of NPCs (a player can only call
  `join_combat` for their own characters), so there is no player path that
  reveals an NPC.

**What a player sees instead:** when a combatant appears, the new chip animates
into the strip. There is no dialog, no toast, and no confirmation. A player's own
join and edits show only an inline status ("Joined", "Saved") in the popover.

It fires from every add path, through one helper (`confirmReveal` in a new
`src/lib/revealGuard.ts`) that each caller awaits before `setCombat`:

- the combat roster add and **Add from NPCs** (`CombatRoster.tsx`, `CombatTrackerPage.tsx`);
- the encounter runner;
- battle map **Add to combat** for a token (`BattleMapPage.tsx`, the two `makeCombatant` sites);
- a monster group's **Add to initiative** (`GroupBox`, `addGroupToInitiative`);
- an NPC assigned to a player (it is still a non-PC);
- revealing a hidden combatant;
- **Start combat**, when ending `gathering` reveals any non-PC (the dialog lists
  everything that is about to appear).

Cancel adds nothing.

**The checkbox is a persistent DM preference, not a session setting.** **Don't
show this message again** writes `codex.prefs.hideRevealWarning` to this device's
`localStorage` (the same place the app keeps other `codex.*` preferences). While
it is set, `confirmReveal` returns true without a dialog. The DM turns the
warning back on from a **Reset hidden messages** control in the app's
preferences page (confirm the exact location at build time). Because the
warning guards a privacy edge, **Preferences** also names what it hides.

**Hiding instead.** New per-combatant flag `Combatant.hiddenFromPlayers`
(optional boolean, so no migration of saved state). A small eye toggle on the
roster row sets it. Hidden combatants take their turn in the DM's order but are
skipped in the player strip and in the upload. A combatant whose token is hidden
is treated as hidden, so the two flags cannot disagree. New combatants added from
a hidden token inherit the flag.

The dialog must **not** appear when:

- the user is a player, or is not the DM (see above);
- there is no live session, or the DM is not signed in;
- the combat is in `gathering` or not shared (nothing is visible, so the warning
  moves to **Start combat**);
- the combatant is a PC, or is flagged hidden;
- a group is only being built (grouping is prep; nothing enters initiative);
- the DM previews as a player (check the preview mode flag at build time);
- the preference above is set.

In the demo it **does** appear, using a simulated live session: the guard needs
no network, and it lets the owner try the dialog. Nothing is uploaded (see
section 5).

### 4. Data model and transport

Mirror the live scene design: DM writes a privacy-filtered copy; members read it
over Realtime; a player writes only through narrow RPCs.

**`shared_combat`** (one row per campaign, exists only while the DM shares combat)

| Column | Notes |
| --- | --- |
| `campaign_id` | PK, references `campaigns` on delete cascade |
| `phase` | `'gathering'` (players may join, NPCs not shown) or `'active'` |
| `round` | int |
| `active_ids` | jsonb array of row ids whose turn it is (a group slot has one id) |
| `updated_at` | timestamptz |

**`shared_combatants`** (rows, never includes hidden combatants)

| Column | Notes |
| --- | --- |
| `id` | uuid PK. The combatant id for DM rows; for a player's row, the id the RPC creates, which the DM client adopts as the local combatant id |
| `campaign_id` | references `shared_combat(campaign_id)` on delete cascade, so ending combat clears every row |
| `controlled_by` | the player allowed to edit this row's initiative and to remove it: the player who joined it, or the member the DM assigned. Null for plain DM rows |
| `source` | `'dm'` or `'player'` (who created the row) |
| `char_key` | stable per-character key for player-created rows, so a re-join updates the same row |
| `name`, `kind` | `kind` is `'pc'`, `'ally'`, or `'enemy'`; a group is one `'enemy'` row |
| `initiative`, `sort_order` | the DM sends the final order in `sort_order` |
| `hp`, `max_hp` | null unless `kind` is `pc` or `ally` |
| `health_marker` | `'injured'`, `'bloodied'`, `'deaths_door'`, or null. Enemy rows only, only when the DM enabled it |
| `conditions` | jsonb array of names |
| `group_count` | null unless the row is a group slot |

The table has no damage column: the strip never shows damage.

**Why two tables, not one jsonb row.** A player's join or edit must not race with
the DM's push. With rows, the DM's diff-push (the `pushedTokens` pattern in
`useDmLiveScene`) upserts and deletes only rows it owns, and a player's change
lands on one row.

**DM side.** A new `useDmLiveCombat` (beside `useDmLiveScene`, same debounce and
queued, diffed push) builds the rows from `getCombat()` with the privacy filter
(hidden dropped, enemy HP replaced by the marker, groups collapsed), and:

- adopts a player-created row with no local combatant: `makeCombatant({ isPC:
  true, ... })` with `id = row.id` and `controlledBy = row.controlled_by`, then
  `resortKeepTurn` when active, and a toast with **Remove** and **Edit**;
- applies a player's initiative edit: when a row with `controlled_by` differs from
  what the DM last pushed, copy only `initiative` into the local combatant, re-sort,
  and toast the old and new values;
- treats a row that disappears and is not in the DM's own "gone" list as a player
  leaving: remove the local combatant and toast **Undo** (undo re-adds it and
  re-uploads the row);
- deletes `shared_combat` when the DM ends combat, clears combat, or ends the live
  session, which cascades every row.

DM state stays the source of truth (still localStorage). The cloud copy is a
mirror plus the player's inbox. T-99 and T-98 keep working because `combat.ts`
only gains three optional fields: `hiddenFromPlayers`, `controlledBy`,
`showHealthMarker`.

**Player side.** A new `useLiveCombat(cloudCampaignId)` in
`src/auth/liveCombat.ts`: fetch on mount, Realtime channel on both tables,
refetch on `SUBSCRIBED`, gated on the auth token and with a unique channel name,
exactly like `useLiveScene` (same reasons: anon joins drop RLS events). No
polling. Offline or after a reconnect, the refetch on `SUBSCRIBED` repairs the
list. A failed write shows an inline error and a **Retry** button; there is no
offline queue.

**Security review.**

| Concern | Control |
| --- | --- |
| Player adds another combatant | The only insert path is `join_combat`, which writes a row with `controlled_by = auth.uid()` and `source = 'player'`, capped at 6 per player. No member INSERT policy. |
| Player edits or removes a row they do not control | `set_combat_initiative` and `leave_combat` require `controlled_by = auth.uid()`. No member UPDATE or DELETE policy. A player cannot reassign `controlled_by`. |
| Player changes more than initiative | `set_combat_initiative` writes only `initiative`. `join_combat` on an existing DM row writes only `initiative`, and updates `name` only on rows with `source = 'player'`. |
| Player reads hidden combatants | They are never uploaded. |
| Player reads enemy HP | Enemy rows carry `hp = null`, `max_hp = null`. At most a marker is present. The privacy filter runs on the DM device before upload, like `toLiveTokens`. |
| Anon access | RLS policies are `to authenticated`. Every function does `revoke all ... from public, anon` and `grant execute ... to authenticated`. |
| DM abuse via the RPCs | The RPCs refuse the owner (the DM edits through RLS) and refuse when no `shared_combat` row exists. |
| Input abuse | Name 1 to 60 characters, initiative -10 to 60, HP clamped 0 to 999, 6 player-created rows per player. |
| Group internals | The upload sends the slot, never members. |

The DM's own browser is the trusted filter. A modified DM client could upload
more, but the DM already owns the campaign.

**Migration 0045** (additive: two new tables, three new functions; nothing
existing changes, so the old code keeps working). The owner runs this by hand in
the Supabase SQL Editor before the build PR merges into `dev`:

```sql
-- Players see the initiative order and manage their own characters (T-100).
-- The DM mirrors a privacy-filtered copy of the combat here: hidden combatants and
-- enemy HP are never uploaded (an enemy row carries at most a health marker).
-- Members read; the owner (DM) writes; a player writes only rows they own or
-- control, through join_combat(), set_combat_initiative() and leave_combat().
-- Run in Supabase -> SQL Editor.

create table if not exists public.shared_combat (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  phase text not null default 'gathering' check (phase in ('gathering', 'active')),
  round integer not null default 1,
  active_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.shared_combat enable row level security;

create table if not exists public.shared_combatants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.shared_combat(campaign_id) on delete cascade,
  -- The player who may edit this row's initiative and remove it.
  controlled_by uuid references public.profiles(id) on delete set null,
  source text not null default 'dm' check (source in ('dm', 'player')),
  char_key text,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'enemy' check (kind in ('pc', 'ally', 'enemy')),
  initiative integer,
  sort_order integer not null default 0,
  hp integer,
  max_hp integer,
  health_marker text check (health_marker in ('injured', 'bloodied', 'deaths_door')),
  conditions jsonb not null default '[]'::jsonb,
  group_count integer,
  updated_at timestamptz not null default now()
);
alter table public.shared_combatants enable row level security;
create index if not exists shared_combatants_campaign_idx on public.shared_combatants (campaign_id);
create index if not exists shared_combatants_controller_idx on public.shared_combatants (campaign_id, controlled_by);
-- One row per player character: a re-join updates it.
create unique index if not exists shared_combatants_char_uniq
  on public.shared_combatants (campaign_id, controlled_by, char_key)
  where source = 'player' and char_key is not null;

drop policy if exists "shared_combat owner" on public.shared_combat;
create policy "shared_combat owner" on public.shared_combat for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));
drop policy if exists "shared_combat read" on public.shared_combat;
create policy "shared_combat read" on public.shared_combat for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

drop policy if exists "shared_combatants owner" on public.shared_combatants;
create policy "shared_combatants owner" on public.shared_combatants for all to authenticated
  using (public.is_owner(campaign_id, (select auth.uid())))
  with check (public.is_owner(campaign_id, (select auth.uid())));
drop policy if exists "shared_combatants read" on public.shared_combatants;
create policy "shared_combatants read" on public.shared_combatants for select to authenticated
  using (public.is_member(campaign_id, (select auth.uid())));

-- A player joins one of their characters. If a row already exists for them (they
-- joined before, or the DM added the PC first), it updates that row's initiative
-- instead of inserting a duplicate.
create or replace function public.join_combat(
  cid uuid, pname text, init integer, hp_now integer, hp_max integer, ckey text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  clean text := trim(coalesce(pname, ''));
  rid uuid;
  rsrc text;
begin
  if uid is null or not public.is_member(cid, uid) or public.is_owner(cid, uid) then
    raise exception 'Only a player in this campaign can join.';
  end if;
  if not exists (select 1 from public.shared_combat where campaign_id = cid) then
    raise exception 'The DM has not opened initiative.';
  end if;
  if char_length(clean) not between 1 and 60 then
    raise exception 'Enter a name of 1 to 60 characters.';
  end if;
  if init is null or init not between -10 and 60 then
    raise exception 'Initiative must be between -10 and 60.';
  end if;

  select id, source into rid, rsrc from public.shared_combatants
   where campaign_id = cid and controlled_by = uid
     and ((ckey is not null and char_key = ckey) or lower(name) = lower(clean))
   order by (char_key = ckey) desc nulls last
   limit 1;

  if rid is not null then
    update public.shared_combatants
       set initiative = init,
           name = case when rsrc = 'player' then clean else name end,
           updated_at = now()
     where id = rid;
    return rid;
  end if;

  if (select count(*) from public.shared_combatants
       where campaign_id = cid and controlled_by = uid and source = 'player') >= 6 then
    raise exception 'You can add up to 6 characters.';
  end if;
  insert into public.shared_combatants
      (campaign_id, controlled_by, source, char_key, name, kind, initiative, hp, max_hp)
  values (cid, uid, 'player', coalesce(ckey, lower(clean)), clean, 'pc', init,
          least(greatest(coalesce(hp_now, 0), 0), 999), least(greatest(coalesce(hp_max, 0), 0), 999))
  returning id into rid;
  return rid;
end $$;
revoke all on function public.join_combat(uuid, text, integer, integer, integer, text) from public, anon;
grant execute on function public.join_combat(uuid, text, integer, integer, integer, text) to authenticated;

-- A player changes the initiative of a combatant they own or control, any time.
create or replace function public.set_combat_initiative(cid uuid, rid uuid, init integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if init is null or init not between -10 and 60 then
    raise exception 'Initiative must be between -10 and 60.';
  end if;
  update public.shared_combatants
     set initiative = init, updated_at = now()
   where id = rid and campaign_id = cid and controlled_by = auth.uid()
     and public.is_member(cid, auth.uid());
  if not found then
    raise exception 'You can only change your own character.';
  end if;
end $$;
revoke all on function public.set_combat_initiative(uuid, uuid, integer) from public, anon;
grant execute on function public.set_combat_initiative(uuid, uuid, integer) to authenticated;

-- A player removes a combatant they own or control.
create or replace function public.leave_combat(cid uuid, rid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.shared_combatants
   where id = rid and campaign_id = cid and controlled_by = auth.uid()
     and public.is_member(cid, auth.uid());
end $$;
revoke all on function public.leave_combat(uuid, uuid) from public, anon;
grant execute on function public.leave_combat(uuid, uuid) to authenticated;

-- Live updates. REPLICA IDENTITY FULL so DELETE events carry campaign_id for RLS (see 0008).
alter table public.shared_combat replica identity full;
alter table public.shared_combatants replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.shared_combat;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.shared_combatants;
  exception when duplicate_object then null;
  end;
end $$;
```

Build-time checks: confirm the number 0045 is free when the build starts (T-98 or
T-99 may claim it), and re-read the SQL against the then-current `is_member`.
Known limit: the DM adding a PC for a player who has not joined yet creates a
`source = 'dm'` row; if the player later joins under a different name, they get a
second row, and the DM removes one. The name match covers the usual case.

**The `gathering` phase** is part of the design (owner decision): the DM presses
**Ask players for initiative** to open it, and **Start combat** moves it to
`active`. NPCs stay private until **Start combat**, where the warning fires.

### 5. Demo and tests

**Demo.** The demo never reaches Supabase. `useDmLiveCombat` sets `available =
false` for `isDemo()`, exactly like `useDmLiveScene`. The DM warning (with its
preference checkbox), the hide toggle, the health marker toggles, the player
assignment, and **Start combat** work in the demo against local state. The player
strip has no data source in the demo, so the owner sees it in the
`player-initiative-mockup.html` file, and in a Playwright test that serves it
from mocked responses. The `PlayerInitiativeStrip` component takes plain props
(`entries`, `round`, `activeIds`, `mineIds`), so it renders from fixtures without
any network.

**Playwright (mocked Supabase, like `e2e/world-map-detail.spec.ts`).** New
`e2e/player-initiative.spec.ts`:

- strip renders from mocked `shared_combat` and `shared_combatants` responses:
  order, round, current turn, enemy initiative numbers shown, ally HP shown, enemy
  HP and damage absent, a group shows "×3" and no member names;
- health markers: a mocked row with `health_marker: 'bloodied'` shows "Bloodied";
  a row with none shows nothing;
- the player's own chip and an assigned mount chip carry the "yours" outline; a
  chip they do not control has no edit control;
- **Join initiative**: the mocked `rpc/join_combat` is called with the typed
  initiative and `char_key`; **Add another** joins a second character; editing
  initiative calls `rpc/set_combat_initiative` at any phase; **Leave** calls
  `rpc/leave_combat` with the row id;
- the strip is absent when `shared_combat` is empty, and no RPC fires;
- phone landscape (844 × 390) collapses the strip and the board keeps its size;
- DM warning on the demo: adding two NPCs while active shows the dialog with both
  names on every add; **Cancel** adds none; **Add** adds both; the **Don't show
  this message again** box suppresses later dialogs, persists across a reload, and
  **Reset hidden messages** brings it back; adding a PC and adding a hidden NPC
  show no dialog; building a group shows none;
- DM fallback: adding a PC for a player who already joined is skipped with a toast;
- **The dialog never renders for players.** On the player routes
  (`/player/:campaignId/session` and the other `/player/...` pages), with mocked
  Supabase: a row appearing in `shared_combatants` (a Realtime payload and a
  refetch) adds a chip and no `[role=dialog]` named "Show these combatants to
  players?"; **Join initiative**, an initiative edit, **Leave**, and a controlling
  player's mount edit never render it; and a spy on `confirmReveal` (exposed on
  `window` in test builds only) records 0 calls. The same assertions run in
  **preview as player** from the DM side (check the preview mode flag at build
  time). A unit test also checks that `confirmReveal` returns true with no dialog
  for a player campaign.
- `supabaseRequests` stays empty for the demo tests.

Unit tests (pure functions): `publicCombatRows(combat, groups, tokens, settings)`
(privacy filter, group collapse, marker thresholds at 50, 25, and under 5 percent,
marker off by default, per-combatant override), `needsRevealWarning(...)`, and the
PC duplicate check.

**Cannot be tested without two signed-in accounts** (use the owner's DM account
and a test player on the live site, or the local Supabase stack from `e2e:live`
with two or three seeded users):

- a real Realtime round trip from the DM's push to a player's strip;
- a player's join, initiative edit, or leave reaching the DM and the DM's tracker;
- RLS and RPC denial for a second player trying someone else's row or an
  unassigned NPC, and for anon;
- a mount assigned to one player staying untouchable by another;
- the DM's tab closed while a player joins, then reopened;
- Google sign-in itself (production domain only).

### 6. Risks and open questions for the owner

Resolved by the owner: warning on every add with a persistent checkbox; an **Ask
players for initiative** step with the player's join as the primary path and no
duplicates from the DM fallback; initiative editable by players at any time;
several characters per player and NPCs assignable to players; enemy initiative
visible, enemy HP never, with optional health markers.

New open questions:

1. **`damageTaken` on tokens.** Enemy tokens on the player board already show
   damage taken. With markers opt-in and off by default, players still see damage
   numbers on tokens. Do you want to keep that (my recommendation: keep, change
   nothing), or put it behind the same opt-in?
2. **Rejoining an assigned NPC.** A player can edit and leave with an assigned
   mount, but only the DM can put it back in. Is that enough, or should a
   player-controlled NPC be able to rejoin by itself?

Risks:

- **Combat mirror drift.** The DM's `localStorage` combat is the source of truth,
  and the cloud is a mirror. A DM who clears browser data mid-combat loses the
  combat, but the players' rows stay until the DM ends it.
- **Mid-combat initiative edits.** A player can move their own slot at any time.
  The DM sees the old and new values in a toast, and can edit it back.
- **Sequencing.** The build touches `combat.ts`, the roster, and
  `BattleMapPage.tsx`. It must wait for PR 162 and T-99, then rebase.
