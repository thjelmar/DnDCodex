# Campaign home: gap analysis against the new Stitch mockup

Analysis only. No code was built for this document. Written 2026-11-20 against
`origin/dev` at `8488998` (PRs #136 to #139 merged: sidebar page tree, breadcrumb
header, hero, 12-column Overview, prep checklist, recently edited feed).

Inputs: `screen.png`, `code.html` and `DESIGN.md` from the Stitch export
(`stitch_d_d_codex_layout_exploration_demo_data_only.zip`), read as data. The
current app was checked from the code and from headless screenshots of the demo
campaign "The Hollow Crown" at 1440px and 375px, dark and light.

## What the mockup is

A campaign home built around four large **hub cards** in a 2x2 grid, each a
preview of one area (Prep, Run, World & Lore, Reference & Rules), under a tall
hero. A bottom row has Recent Sessions, Voice & Table Links and a World synopsis.
A footer holds settings, invites and sync status.

What the owner likes (my reading): the cards show *content*, not just counts. A
battle map thumbnail, NPC portraits, a world map thumbnail, the last session's
recap and recently added items make the home page feel alive.

## What the live Overview has today

Hero (name, rename, summary, cover, Campaign settings), a next-session strip, six
stat tiles, then a two-column body: World overview, Recent sessions, Prep checklist
and Recently edited on the left; Links and Voice on the right. The sidebar tree
holds every page, with counts.

Two gaps stand out before the element table:

1. The page shows **counts** and **text lists**, but no images. The data for
   thumbnails and portraits already exists locally.
2. After removing Linked campaigns (Part 2), the right column is short next to a
   tall main column, so wide screens have dead space.

## Element table

Legend: **Dev** = already on dev. **Data** = doable from data we already have
(no migration, no Supabase; demo-safe). **New** = needs a new feature. **Skip** =
invented by Stitch or not worth building.

### Header and hero

| Mockup element | Verdict | Notes |
| --- | --- | --- |
| Breadcrumb (Campaigns / name / page) | **Dev** | Done in #136. |
| Search, notifications bell, preferences | **Dev** | In the sidebar icon row. |
| Hero with cover, name, summary | **Dev** | Done; the mockup's hero is taller and has no inline controls. |
| Summary shown as a quote | **Data** | Style only: italic serif on `campaign.summary`. |
| "Active campaign" badge | **Data** | `campaign.archived` gives Active or Archived. |
| "Next session: Not scheduled · Set date" inside the hero | **Data** | `nextSessionDate` and the planner exist; move the strip into the hero. |
| **Run Session** button inside the hero | **Data** | Exists in the header; repeat or move it into the hero. |
| "D&D 5E", "Act II", "Level 6 Party" | **Skip** | No such fields. Could be optional campaign fields later; "Act II" is invented. |
| "Resume Session" | **Skip** | Needs live run state. Not local-only. |
| "Quick Cast" | **Skip** | Spell casting does not exist in the app. |
| "Log Note" | **New** | A one-tap quick note (see Recommendations, "Later"). |

### Prep card

| Mockup element | Verdict | Notes |
| --- | --- | --- |
| "3 Pending Tasks" pill | **Data** | Count of unticked `derivePrepChecklist` items (built in #139). |
| "Plan Next Session" button | **Data** | Link to `?planner=1` (exists) or "New session". |
| "Recent milestone log" (last session, date, recap excerpt) | **Data** | Latest `sessions` row by `date`; excerpt from `notes` (player-facing recap). |
| Mini tiles: Sessions 3, Timeline, Encounter Tables 1, Handouts 2 | **Data** | `sessions`, `timelineEvents`, `rollTables` counts; handouts = `images` where `isHandout` is true. "Act II" on Timeline is invented, so show the event count instead. |
| "Vault Status: Synced" | **Data** | From `getSyncStatus()` in `lib/sync.ts` (local state; shows nothing in the demo). |
| "Open Prep Hub →" | **Dev** | Link to Sessions (the tree already has the group). |

### Run card

| Mockup element | Verdict | Notes |
| --- | --- | --- |
| "Ready to Launch" pill | **Data** | True when the campaign has a session and a scene; derived. |
| **Start Run Mode** button | **Dev** | `/run/:id` exists. |
| Battle map thumbnail with name and "24x30 Grid" | **Data** | `scenes` row (most recently updated); `imageId` points into `images`; grid size is `width / grid.cellPx` by `height / grid.cellPx`. A blank-grid scene needs a placeholder. |
| Token avatars (K, T, M) over the thumbnail | **Data** | `scene.tokens` (initials, `imageId`, token icon). |
| Stats: Grid "Active" | **Skip** | Meaningless as a state; use the grid size. |
| Stats: Rewards "3 Items" | **Skip for the demo** | The loot tracker is cloud-only (`PartyLoot`, Supabase, needs sign-in and sharing). Showing it would call Supabase; use Handouts instead. |
| Stats: Scenes "4 Backdrop" | **Data** | `scenes` count. |
| "Initiative Tracker: Standby" | **Skip** | Needs live combat state; low value. |

### World & Lore card

| Mockup element | Verdict | Notes |
| --- | --- | --- |
| "4 NPCs · 4 Locations" pill | **Data** | `npcs`, `locations` counts. |
| NPC portrait strip | **Data** | `npcs[].imageId`; fall back to the token icon or initials (`tokenIcon`, `npcTokenIcon`). |
| World map thumbnail ("Atlas") | **Data** | `worldMaps[0].imageId` into `images`. |
| NPCs "4 Active (1 Hostile)" | **Data** | `disposition` counts. |
| Locations "4 Mapped" | **Data** | Locations that have a pin: `worldMaps[].pins[].ref.kind === 'location'`. |
| World Notes "2 Articles" | **Data** | `notes` count. |
| Families & Factions "3 Houses" | **Data** | `families` count. |
| "Pantheon: The Drowned Trio" | **Skip** | Invented; no pantheon entity. |

### Reference & Rules card

| Mockup element | Verdict | Notes |
| --- | --- | --- |
| "Recently discovered artifacts" chips with rarity | **Data** | Newest `items` by `updatedAt`, with `rarity` as the tag. "Discovered" is not a field; call it "Recently added". |
| Magic Items "3 Logged" | **Data** | `items` count. |
| Roll Tables "d100 Loots" | **Data** | `rollTables` count and category. |
| Tags "3 Active" | **Data** | Distinct tags across entities (the Tags page already aggregates them). |
| "Bestiary Index · 5e SRD" | **New** | A browsable bestiary from the bundled `srdMonsters.json`. The data is local; the page is new. |
| "Rules & Index", "Quick Index: Ready" | **Skip** | Invented. |

### Bottom row and footer

| Mockup element | Verdict | Notes |
| --- | --- | --- |
| Recent Sessions (3 rows, "View all") | **Dev** | Done. |
| Status chip "Completed" | **Data** | Derived from `date` versus today. |
| Hours played, "Round 8 of Combat" | **Skip** | No such data. |
| Session subtitle ("Infiltration", "Crown Theft") | **Data** | `session.tags`. |
| Voice channel and **Join** button | **Dev** | Done (`DiscordVoiceSettings`, `JoinVoiceButton`). |
| "3 Connected: names" live roster | **New (cloud)** | `useVoiceRoster` exists but reads Supabase Realtime. Only for a signed-in user, never in the demo. |
| D&D Beyond, shared folder, Spotify links | **Dev** | `CampaignLinks` already holds any external link. Stitch's Spotify tile is just a link a user adds. |
| "Server: US-East Table 4 · Low Latency" | **Skip** | Invented. |
| World Lore Synopsis panel with Edit | **Dev** | The World overview panel. |
| Quote and "— Arch-Chronicler Malakor" | **Skip** | Invented attribution. |
| Hashtags (#high-fantasy) | **Data** | Campaigns have no tags; show the most-used entity tags instead. |
| "Player-Facing View" | **New** | A DM preview of what players see; sharing flags exist but no preview surface. |
| "Full Codex →" | **Dev** | Link to World notes. |
| Footer: Campaign Settings & Export | **Dev** | Settings dialog exists. Export is a whole-database export on the Backup page, not per campaign. |
| Footer: Invite Players & Permissions | **Dev** | `InvitePlayers` in the header; "Permissions" has no equivalent. |
| Footer: Campaign ID | **Skip** | Internal; not useful to a DM. |
| Footer: "Synced 2m ago" | **Data** | `getSyncStatus().lastSyncedAt` (hidden in the demo). |
| Footer: "OGL v1.8.4 SRD" | **Check** | The Credits page has no SRD or OGL text. Worth confirming the SRD attribution requirement separately; not a layout item. |

### Sidebar in the mockup

| Mockup element | Verdict | Notes |
| --- | --- | --- |
| Daily Duel with NEW badge | **Dev** | Link exists; the badge is cosmetic (What's New already marks updates). |
| Encounters, Dungeon Maps, Loot Tables | **Dev** | Encounter Builder, Battle Map and Tables exist. |
| Spell Archive, Party Roster, Character Vault | **Skip** | No DM-side party or spell data. Player campaigns have character sheets, but DM campaigns do not. |
| Dice Roller | **Dev** | Under Tools. |
| Bestiary, Rules & Index | **New / Skip** | Bestiary as above; Rules & Index invented. |
| "v2.4.1 Grimoire · DND-5E" | **Skip** | Invented. |

## Recommended subset, in priority order

Effort: S is about half a day, M about one day, L more than two days. Each item
reads only local Dexie data, so none touches Supabase and all work in the demo.

1. **Hub cards as the Overview's centre, replacing the six stat tiles** (M, split
   into the rows below). Each card keeps the mockup's anatomy: title, pill,
   preview, mini tiles, "Open" link. This is where the owner's "how much it
   offers" comes from.
   1. **World & Lore card** (M): portrait strip, atlas thumbnail, counts with
      hostile and mapped. Highest wow for the effort.
   2. **Run card** (M): battle map thumbnail with token avatars, **Start Run
      Mode**, grid size, scenes and handouts counts.
   3. **Prep card** (S to M): pending-tasks pill, "Plan Next Session", last
      session recap excerpt, the four mini tiles. The checklist logic exists.
   4. **Reference card** (S): recently added item chips, counts, tag count.
2. **Hero tidy** (S): move **Run session** and the next-session line into the
   hero, add the Active/Archived badge, italic quote styling. Removes one
   strip and one header button.
3. **Recent sessions polish** (S): status chip and tag subtitle.
4. **Footer strip** (S): sync status, invite, settings.
5. **Top tags under the world overview** (S).

Later, as separate features (the owner decides): **Log Note** quick capture (M),
**voice roster on the Overview** for signed-in users only (M), **Bestiary** page
from the bundled SRD data (M to L), **Player-facing view** preview (L), optional
campaign fields for system, act and party level (S field plus editing UI).

## Replace or sit alongside?

**Evolve the current Overview; do not add a second one.** The hub cards replace
the stat-tile row (their mini tiles carry the same counts) and become the page's
centre. Keep what the mockup lacks and the owner asked for: the World overview
text, the prep checklist (it feeds the Prep card pill) and the recently edited
feed.

A second "hub" view next to the Overview would duplicate the sidebar tree (which
already lists every page with counts) and split attention. The previews are the
part the tree cannot do, so put them on the existing page.

Suggested desktop order: hero (with Run session and next session) → hub cards
2x2 → World overview and Recent sessions (main) beside Links, Voice and
Recently edited (side). That also fills the short right column.

## Phone (375px)

The mockup has no phone view. Four tall cards would push the World overview far
down the page (each card is about 300px with a thumbnail). Proposal:

- Order: hero, next session, **World overview**, hub cards, Recent sessions,
  Links and Voice. World overview stays first after the hero, as agreed earlier.
- Hub cards become **collapsible panels** (the existing `CollapsePanel`): Prep and
  Run open, World and Reference closed; thumbnails scale to full width at a fixed
  aspect ratio (no layout jump); mini tiles stay two columns.
- Drop decorative lines ("Vault Status", "Initiative Tracker") on a phone.

## Light theme

- The mockup's yellow "pending" and green "ready" pills use dark-theme tints. Use
  the existing `--good` token and an amber token with a light-mode variant, and
  check contrast on white (the default violet accent already needed `--link` in
  #137 and #138).
- Thumbnails need a 1px `--border` outline so a pale map doesn't melt into a white
  card.
- Reuse tokens only (`--bg-elev`, `--border`, `--text-dim`); no new hex values.

## Open questions for the owner

1. Replace the stat tiles with the hub cards (my recommendation), or keep both?
2. Should **Run session** live in the hero only, or stay in the header too?
3. Is a loot count wanted on the Run card? It needs a signed-in, shared campaign,
   so it would be blank in the demo and for local-only campaigns.
4. Do you want the "Player-facing view" or the Bestiary scheduled, since both are
   new surfaces rather than layout work?
