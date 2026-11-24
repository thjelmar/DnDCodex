# Player-side live session overhaul

Status: design for owner approval. No app code is written yet. The Stitch mockup
comes next and needs approval before the build starts.

## Finding: why the owner saw no initiative

The initiative strip (T-100) exists on the player Session page, but it renders
only when the DM has shared combat:

- `sharePhase()` in `src/lib/liveCombat.ts` returns null unless combat is active
  (**Start combat**) or the DM pressed **Ask players for initiative**.
- `PlayerInitiativeStrip` returns null when it has no combat, so a DM who only
  added combatants to the initiative list shows the player nothing. During the
  asking phase only PCs show; NPCs appear after **Start combat**.
- The design note promised a "No combat right now" line when a map is on show.
  The code doesn't render it, so the player can't tell "not started" from
  "broken".

This is a missing empty state, not a broken data path. The overhaul fixes it. I
couldn't test the signed-in Realtime path in a worker session; the owner needs
to confirm on the live site.

## Goals

1. The player screen uses the Run Mode shell: top bar, tool rail, docked panel,
   turn strip with Round and pulse.
2. Players get the same map mechanics as the DM, read-only where the DM owns
   state: measure, spell area, ping in the player's color, range ring, terrain.
3. One docked panel with tabs: **Initiative**, **Me**, **Notes**, plus **Handouts**.
4. The initiative panel always says what state combat is in.

Non-goals: players moving other tokens, any DM-only data (enemy HP, AC, hidden
combatants, stat blocks, DM notes), new Supabase tables.

## Mockups

Stitch project "D&D Codex round 2: battle map and Run Mode (demo data only)",
screens "Player Live Session — Frozen City" (desktop and phone portrait), design
system "D&D Codex Spellbook". Images: [desktop](round-2/player-session-desktop.png),
[phone portrait](round-2/player-session-phone.png). Phone landscape is not
mocked up; it follows `battle-map-phone-landscape.md`.

Mockup elements I will **not** build, because they break a rule or add scope:

- **End Turn** button. The DM owns turn order. Players get a "Your turn" banner only.
- AC for allies' rows and enemy "Hostile - Melee" subtitles. Players see an
  ally's HP, never AC or stat-block text.
- Spell slots, Cast Spell, Chat, latency, and the Spells / Codex / Gear bottom
  tabs. Out of scope.
- The mock's real-HP bar on the player's row is kept (own character), and the
  "Bloodied / Healthy" label on enemies is kept only when the DM turns markers on.

## Layout

| Size | Layout |
| --- | --- |
| Desktop | Top bar. Tool rail on the left of the map. Docked right panel with tabs. Turn strip over the map. |
| Phone portrait | Top bar, map, turn strip, bottom tab bar that opens the panel as a sheet. |
| Phone landscape | Map full height. Tool rail on the left edge. Turn strip collapses to now plus next two. Panel is a side sheet. Safe-area insets and `dvh`, as in T-96 and T-97. |

Initiative panel states:

| State | The player sees |
| --- | --- |
| No combat shared | "No combat yet. Your DM will ask for initiative." |
| Gathering | Round label "Roll for initiative", **Join initiative** button, PCs only. |
| Active | Order list, current turn highlighted, enemy initiative numbers, no enemy HP, optional Injured / Bloodied / Death's door markers. |

**Me** tab: the player's own character card (HP, AC, conditions from the local
sheet) and a dice bar.

## Reuse plan

Reuse `TurnStrip`, the tool rail, the top bar, and the docked panel shell from
the DM side. Pass a `readOnly` or `role="player"` prop where state is DM-owned.
Reuse `useLiveCombat` and `useLiveScene` unchanged. No fork of DM components.

## Extras proposed for owner approval (pick any)

| # | Extra | Cost |
| --- | --- | --- |
| A | My-turn indicator: banner, pulse on the strip, and a notification or vibrate | small |
| B | Quick own-character HP and conditions on the **Me** tab (local only) | small |
| C | Handouts tab (the shared handouts, moved into the panel) | small |
| D | Last-session recap at the top of **Notes** (from the Story So Far) | small |
| E | Quick-roll bar using the character's modifiers (checks, saves, attacks) | medium |

Recommendation: A, B, C now; D and E as follow-ups.

## Approaches

1. **Reuse the Run Mode shell with a player mode (recommended).** One shell,
   different tabs and tools. Least code, stays in step with DM changes.
2. Build a separate player shell. More freedom, but two layouts to maintain.
3. Only add the empty state and the strip. Smallest change, leaves the old UI.

## Open questions for the owner

- Which extras (A to E)?
- Should the Notes editor stay in the panel, or open as a sheet on phones?
