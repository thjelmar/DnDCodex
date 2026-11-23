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
  marker, and condition pips.
- **Allies** (`isPC`, player-controlled, `friendly`) show real HP and max HP.
  This matches `tokenCombat`.
- **Enemies** show only `damageTaken` (the same number the token overlay shows).
  Never HP, max HP, or AC.
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

A **Join initiative** button sits at the right end of the strip header.

1. The button shows only when the DM has opened initiative (section 4) and the
   player has a linked character. A player with no `characterData` can still join
   by typing a name (prefilled from their campaign's player name).
2. Click opens a small popover: **Initiative** (number field prefilled with a
   d20 + dex modifier roll, a **Reroll** button, typed value allowed), and
   **Join**. Dex modifier comes from `characterData.abilities.dex`. Without a
   sheet, the modifier is 0.
3. **Join** calls the `join_combat` RPC. The player's chip appears, with an
   "(you)" marker. The button becomes **Leave initiative**.

Rules:

- **No approval step.** The row is added directly. The DM sees a toast, "Aria
  joined initiative (17)", with **Remove** and **Edit** actions. This keeps the
  table fast; the DM keeps final say.
- **A player can do three things**, all to their own row only: join, change
  their own initiative while the phase is `gathering` (before the DM starts
  combat), and leave at any time. HP, conditions, order, and the turn belong to
  the DM.
- **One character per player per campaign** in v1 (unique on `campaign_id,
  user_id`).
- **Self-reported stats.** The player sends name, dex modifier, HP, max HP, and AC.
  A player could type any HP for their own character. That is acceptable because
  the DM tracks HP afterwards and sees the toast. The server clamps ranges.
- **Combat not open**: no button. The strip area shows "No combat right now" only
  when a map is on show; otherwise nothing renders.
- **Combat already active**: joining is allowed and inserts the player into the
  order. The DM client re-sorts and keeps the turn on the same slot
  (`resortKeepTurn`). Initiative is locked after that, so a player cannot reroll
  after seeing the order.
- **DM removes the player**: the row is deleted, and the player's button returns
  to **Join initiative**.

### 3. DM warning pop-up

Dialog (modal, uses the app's existing dialog and `useDialogExit` animation):

> **Show these combatants to players?**
> Everyone in the live session will see these combatants once they appear:
> Goblin 1, Goblin 2, Grok the Ogre.
> [ ] Do not ask again this session
> **Cancel** **Add**

Fires when all of these hold:

- the DM has a live session (`useLiveSession` returns a row), and
- the shared combat is `active` (players can currently see it), and
- the add includes at least one non-PC combatant that is not flagged hidden.

It fires from every add path, through one helper (`confirmReveal` in a new
`src/lib/revealGuard.ts`) that each caller awaits before `setCombat`:

- the combat roster add and **Add from NPCs** (`CombatRoster.tsx`, `CombatTrackerPage.tsx`);
- the encounter runner;
- battle map **Add to combat** for a token (`BattleMapPage.tsx`, the two `makeCombatant` sites);
- a monster group's **Add to initiative** (`GroupBox`, `addGroupToInitiative`);
- **Start combat**, when `gathering` ends and the order holds visible NPCs
  (the dialog lists everything that is about to appear).

Cancel adds nothing. "Do not ask again this session" stores
`codex.revealWarn.<campaignId>` in `sessionStorage`, so it resets when the tab
closes and when the DM ends the live session.

**Hiding instead.** New per-combatant flag `Combatant.hiddenFromPlayers`
(optional boolean, so no migration of saved state). A small eye toggle on the
roster row sets it. Hidden combatants take their turn in the DM's order but are
skipped in the player strip and in the upload. Revealing one later shows the same
dialog for that combatant. A combatant whose token is hidden is treated as
hidden, so the two flags cannot disagree. New combatants added from a hidden
token inherit the flag.

The dialog must **not** appear when:

- there is no live session, or the DM is not signed in;
- the combat is still in `gathering` or not shared (nothing is visible, so the
  warning moves to **Start combat**);
- the combatant is a PC, or is flagged hidden;
- a group is only being built (grouping is prep; nothing enters initiative);
- the DM previews as a player (check the preview mode flag at build time);
- the user turned on "Do not ask again this session".

In the demo it **does** appear, using a simulated live session: the guard needs
no network, and it lets the owner try the dialog. Nothing is uploaded (see
section 5).

### 4. Data model and transport

Mirror the live scene design: DM writes a privacy-filtered copy; members read it
over Realtime; a player writes only through a narrow RPC.

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
| `user_id` | null for DM rows, the player's id for a player-joined row. Unique with `campaign_id` where not null |
| `name`, `kind` | `kind` is `'pc'`, `'ally'`, or `'enemy'`; a group is one `'enemy'` row |
| `initiative`, `sort_order` | the DM sends the final order in `sort_order` |
| `hp`, `max_hp` | null unless `kind` is `pc` or `ally` |
| `damage_taken` | int, enemies and allies |
| `conditions` | jsonb array of names |
| `group_count` | null unless the row is a group slot |

**Why two tables, not one jsonb row.** A player's join must not race with the
DM's push. If the DM overwrote one jsonb blob every 250 ms, a join could be lost.
With rows, the DM's diff-push (same pattern as `pushedTokens` in
`useDmLiveScene`) upserts and deletes only its own rows (`user_id is null`), and a
player's row is untouched except where the DM edits it.

**DM side.** A new `useDmLiveCombat` (beside `useDmLiveScene`, same debounce and
queued, diffed push) builds the rows from `getCombat()` with the privacy filter,
and:

- adopts player rows: a row with `user_id` that has no local combatant becomes a
  `makeCombatant({ isPC: true, ... })` with `id = row.id`, then `resortKeepTurn`
  when active, and a toast with **Remove** and **Edit**;
- removes the local combatant when a player row disappears (the player left);
- deletes `shared_combat` when the DM ends combat, clears combat, or ends the live
  session, which cascades every row.

DM state stays the source of truth (still localStorage). The cloud copy is a
mirror plus the player's inbox. T-99 and T-98 keep working because nothing in
`combat.ts` changes shape except the optional `hiddenFromPlayers` field.

**Player side.** A new `useLiveCombat(cloudCampaignId)` in
`src/auth/liveCombat.ts`: fetch on mount, Realtime channel on both tables,
refetch on `SUBSCRIBED`, gated on the auth token and with a unique channel name,
exactly like `useLiveScene` (same reasons: anon joins drop RLS events). No
polling. Offline or after a reconnect, the refetch on `SUBSCRIBED` repairs the
list. A failed **Join** shows an inline error and a **Retry** button; there is no
offline queue.

**Security review.**

| Concern | Control |
| --- | --- |
| Player adds another combatant | The only write path is `join_combat`, which writes one row with `user_id = auth.uid()`. There is no INSERT policy for members. |
| Player edits or deletes someone else's row | RPCs filter on `user_id = auth.uid()`. No member UPDATE or DELETE policy. |
| Player reads hidden combatants | They are never uploaded. RLS gives members `select` on a campaign's rows, and the rows hold nothing private. |
| Player reads enemy HP | Enemy rows carry `hp = null`. The privacy filter runs on the DM device before upload, like `toLiveTokens`. |
| Anon access | RLS policies are `to authenticated`. Both functions `revoke all ... from public, anon` and `grant execute ... to authenticated`. |
| DM abuse via the RPC | `join_combat` refuses the owner (`is_owner`) and refuses when no `shared_combat` row exists. |
| Input abuse | Name 1 to 60 characters, initiative -10 to 60, HP and AC clamped 0 to 999. |
| Group internals | The upload sends the slot, never members. |

The DM's own browser is the trusted filter. A modified DM client could upload
more, but the DM already owns the campaign.

**Migration 0045** (additive: two new tables, two new functions; nothing existing
changes, so the old code keeps working). The owner runs this by hand in the
Supabase SQL Editor before the build PR merges into `dev`:

```sql
-- Players see the initiative order and add their own character (T-100).
-- The DM mirrors a privacy-filtered copy of the combat here: hidden combatants and
-- enemy HP are never uploaded. Members read; the owner (DM) writes; a player writes
-- only their own row, through join_combat() and leave_combat().
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
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'enemy' check (kind in ('pc', 'ally', 'enemy')),
  initiative integer,
  sort_order integer not null default 0,
  hp integer,
  max_hp integer,
  damage_taken integer not null default 0,
  conditions jsonb not null default '[]'::jsonb,
  group_count integer,
  updated_at timestamptz not null default now()
);
alter table public.shared_combatants enable row level security;
create index if not exists shared_combatants_campaign_idx on public.shared_combatants (campaign_id);
-- One joined character per player per campaign.
create unique index if not exists shared_combatants_user_uniq
  on public.shared_combatants (campaign_id, user_id) where user_id is not null;

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

-- A player joins (or, while the DM is still gathering, re-rolls) their own character.
create or replace function public.join_combat(
  cid uuid, pname text, init integer, hp_now integer, hp_max integer
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  phase_now text;
  rid uuid;
begin
  if not public.is_member(cid, auth.uid()) or public.is_owner(cid, auth.uid()) then
    raise exception 'Only a player in this campaign can join.';
  end if;
  select phase into phase_now from public.shared_combat where campaign_id = cid;
  if phase_now is null then
    raise exception 'The DM has not opened initiative.';
  end if;
  if pname is null or char_length(trim(pname)) not between 1 and 60 then
    raise exception 'Enter a name of 1 to 60 characters.';
  end if;
  if init is null or init not between -10 and 60 then
    raise exception 'Initiative must be between -10 and 60.';
  end if;
  insert into public.shared_combatants (campaign_id, user_id, name, kind, initiative, hp, max_hp)
  values (cid, auth.uid(), trim(pname), 'pc', init,
          least(greatest(coalesce(hp_now, 0), 0), 999), least(greatest(coalesce(hp_max, 0), 0), 999))
  on conflict (campaign_id, user_id) where user_id is not null do update
     set name = excluded.name,
         -- Initiative locks once combat is active: no reroll after seeing the order.
         initiative = case when phase_now = 'gathering' then excluded.initiative
                           else public.shared_combatants.initiative end,
         updated_at = now()
  returning id into rid;
  return rid;
end $$;
revoke all on function public.join_combat(uuid, text, integer, integer, integer) from public, anon;
grant execute on function public.join_combat(uuid, text, integer, integer, integer) to authenticated;

-- A player leaves: removes only their own row.
create or replace function public.leave_combat(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.shared_combatants where campaign_id = cid and user_id = auth.uid();
end $$;
revoke all on function public.leave_combat(uuid) from public, anon;
grant execute on function public.leave_combat(uuid) to authenticated;

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

Build-time check: confirm the number 0045 is free when the build starts (T-98 or
T-99 may claim it), and confirm `gen_random_uuid()` is available (it is on
Supabase).

**The `gathering` phase** is the one optional piece. The DM presses **Ask players
for initiative** (or **Start combat**, which skips straight to `active`).
`gathering` lets players roll before the DM adds NPCs, and it moves the NPC
warning to the moment of **Start combat**. If the owner prefers the smallest
version, drop `gathering`: the row exists only while combat is active and joining
is allowed only then.

### 5. Demo and tests

**Demo.** The demo never reaches Supabase. `useDmLiveCombat` sets `available =
false` for `isDemo()`, exactly like `useDmLiveScene`. The DM warning, the hide
toggle, and **Start combat** work in the demo against local state. The player
strip has no data source in the demo, so the owner sees it two ways: the
`player-initiative-mockup.html` file, and a Playwright test that serves it from
mocked responses. The `PlayerInitiativeStrip` component takes plain props
(`entries`, `round`, `activeIds`, `mine`), so it renders from fixtures without
any network.

**Playwright (mocked Supabase, like `e2e/world-map-detail.spec.ts`).** New
`e2e/player-initiative.spec.ts`:

- strip renders from mocked `shared_combat` and `shared_combatants` responses:
  order, round, current turn, ally HP shown, enemy HP absent, group shows "×3"
  and no member names;
- hidden combatant absent from the strip (the mock never includes it; the unit
  test of the upload filter proves the DM side);
- **Join initiative**: the mocked `rpc/join_combat` is called once with the typed
  initiative, the button becomes **Leave initiative**, and **Leave** calls
  `rpc/leave_combat`;
- the strip is absent when `shared_combat` is empty, and no `join_combat` call
  fires;
- phone landscape (844 × 390) collapses the strip and the board keeps its size;
- DM warning on the demo: adding two NPCs while active shows the dialog with
  both names; **Cancel** adds none; **Add** adds both; the "Do not ask again"
  box suppresses the second dialog; adding a PC and adding a hidden NPC show no
  dialog; building a group shows none;
- `supabaseRequests` stays empty for the demo tests.

Vitest-style unit tests (pure functions): `publicCombatRows(combat, groups,
tokens)` (privacy filter, group collapse), `needsRevealWarning(...)`.

**Cannot be tested without two signed-in accounts** (use the owner's DM account
and a test player on the live site, or the local Supabase stack from `e2e:live`
with two seeded users):

- a real Realtime round trip from the DM's push to a player's strip;
- the player's join reaching the DM and appearing in the DM's tracker;
- RLS and RPC denial for a second player trying someone else's row, and for anon;
- the DM's tab closed while a player joins, then reopened;
- Google sign-in itself (production domain only).

### 6. Risks and open questions for the owner

1. **Start-of-combat warning.** With the `gathering` phase, NPCs added before
   **Start combat** stay private, and the warning fires at **Start**. Is that
   right, or do you want the warning at every add, even before combat starts?
2. **Join before combat.** Do you want the **Ask players for initiative** step
   (recommended), or the smaller version where players join only after the DM has
   started combat?
3. **Initiative lock.** Players can change their roll only before combat starts.
   Is that too strict?
4. **More than one character.** v1 allows one character per player. Does anyone
   play two characters?
5. **Visible initiative numbers.** Players see every revealed combatant's
   initiative number, including enemies. Do you want enemies' numbers hidden
   (order only)?
6. **Risk: combat mirror drift.** The DM's `localStorage` combat is the source
   of truth, and the cloud is a mirror. A DM who clears browser data mid-combat
   loses the combat, but the players' rows stay until the DM ends it. The DM's
   **End combat** clears them.
7. **Risk: sequencing.** The build touches `combat.ts`, the roster, and
   `BattleMapPage.tsx`. It must wait for PR 162 and T-99, then rebase.
