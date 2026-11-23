# Inspector upgrade: token categories, terrain, token card, range ring (T-103)

Status: design approved by the owner (decisions at the end). No app code changed. Phases 1 and 2 wait for T-99 on `dev`; board work waits for T-102 on `dev`.
Mockup: [`round-2/inspector-upgrade-mockup.html`](round-2/inspector-upgrade-mockup.html) (open it in a browser; the tabs at the top switch between states).

## What this covers

The owner reviewed the Stitch prototype "D&D Codex Battle Map & VTT" and approved six features for the DM side of the shared scene inspector (`src/components/battlemap/Inspector.tsx`, used by the battle map studio and Run mode). Hex grids are out of scope.

| # | Feature | Effort |
| --- | --- | --- |
| 1 | Token categories: Character, NPC, Enemy, Props | M |
| 2 | Terrain and cover markers on props | M to L |
| 3 | Selected-token card | S |
| 4 | Movement range ring | M |
| 5 | Template presets | S to M |
| 6 | Grid opacity slider and light level | S |

## What the Stitch prototype shows, and what this design keeps

Sources opened: the saved prototype HTML ("D&D Codex Battle Map & VTT"), and the Stitch project's screen list ("Battle Map Editor", "Battle Map", "DM Run Mode", and the prototype). The three static screens were not re-downloaded; the round 2 screenshots already in `round-2/` cover them.

Kept from the prototype:

- Inspector sections with a count and a collapse chevron ("Heroes (4)", "Hostiles (3)", "Props & Terrains (2)").
- A row per token: name, subtitle, HP, eye toggle.
- A terrain tag on prop rows ("Difficult Terrain", "Half Cover") and a "½ COVER" chip on the map.
- A selected-token card (name, HP, speed, the first attack, "open full sheet").
- A walking-range ring ("Walking Speed: 30 ft").
- A Grid tab with an opacity slider, and an Atmosphere group with an ambient light level.

Dropped, because it is invented rules content or already decided: AC and Spell DC as game mechanics beyond what the app stores, Party Level, "Act II", Quick Ref, Ruleset, the Encounters, Monsters and Spells nav items, hex grids, and the soundscape control. The prototype's "6 hex/sq" speed label becomes "6 squares".

## 1. Token categories

### Data model (additive, no migration)

`TokenKind` changes from `'hero' | 'foe' | 'object'` to four values. The old values stay readable.

```ts
export type TokenKind = 'character' | 'npc' | 'enemy' | 'prop'
/** Values written by T-95; read as the new names. */
export type LegacyTokenKind = 'hero' | 'foe' | 'object'
```

- `SceneToken.kind?: TokenKind | LegacyTokenKind` stays one optional field in the scene JSON. No new store, no Supabase change.
- A pure helper `resolveKind(token, combat, npcs)` in a new `src/lib/tokenKind.ts` returns the effective kind. The inspector, the token editor and the tests all call it, so the rule lives in one place.
- Old values map on read: `hero` to `character`, `foe` to `enemy`, `object` to `prop`. The scene is rewritten with the new names the next time the DM edits that token, so nothing needs a one-time migration and nothing is lost. Reading both spellings means an older browser tab that still writes `hero` keeps working.
- An explicit `hero` always reads as Character, even on an NPC-linked token, because the DM chose it.

Inference when `kind` is unset, first match wins:

1. Player-controlled (`controlledBy`) or its combatant is a PC: **Character**.
2. NPC-linked (`npcId`) and `friendly`, or `friendly` alone: **NPC**.
3. NPC-linked, linked to a combatant, or created from a monster: **Enemy**.
4. Anything else (emoji, icon or plain-label tokens): **Props**.

### How it relates to existing actions

- **Add from NPC.** The menu gains a two-way choice, "Add as NPC" or "Add as Enemy", remembered per session. The default stays Enemy so today's behavior does not change. The campaign's NPC record has no allegiance field, and this design does not add one. The Type selector fixes a wrong guess in one tap.
- **Monster groups (T-95 phase 4).** Group members are Enemy tokens. The group box stays inside the Enemy section, with the member rows nested under it. Changing one member to NPC removes it from the group (a group is a set of enemies sharing a turn). A group never mixes kinds.
- **Initiative and T-100.** `kind` does not decide who is in initiative, so adding a token to combat stays an explicit action. The kind only picks the default for the "+ Init" toggle (on for Enemy, off for Props). T-100 adds `hiddenFromPlayers` on combatants. The section bulk eye in this design changes `SceneToken.hidden` only, and never touches `hiddenFromPlayers`. The two flags stay independent: a token hidden on the map can still be in the order, and T-100 decides what players see there.

### What the DM sees

- Chips under the filter field: **All**, **Characters**, **NPCs**, **Enemies**, **Props**, each with a count. A chip narrows the list to one section; the text filter still works with it.
- Four collapsible sections in that order. Each header shows the count and, on the right, a bulk menu: **Hide all from players** and **Show all to players** on every section, plus **Select all for a group** on Enemies (the only place the inspector selects several tokens). Collapsed state persists per browser in `localStorage`, not in the scene.
- A **Type** selector (`Auto`, Character, NPC, Enemy, Prop) in the token editor beside Shape. `Auto` clears `kind` so inference applies. A small tag on the row shows when the type was set by hand.
- Row subtitle and HP stay as in T-95.

### What players see

Nothing new. `toLiveTokens` (`src/pages/useDmLiveScene.ts`) builds the payload field by field and does not include `kind`; a unit test pins that. Hidden tokens stay withheld whatever their kind.

### Phone and keyboard

- Rows, chips, section headers and bulk buttons are at least 38 px tall. Chips scroll horizontally on a narrow drawer.
- Section headers are real buttons with `aria-expanded`. The bulk menu opens from a button and closes on Escape. Tab order is chips, filter, then each section header followed by its rows.

### E2E (Chromium and WebKit)

- Seed one scene with an old-style `hero`, `foe` and `object` token plus unset ones; assert each lands in Characters, Enemies and Props, and that the unset friendly NPC lands in NPCs.
- Change a token's Type; assert it moves section and survives a reload.
- Bulk hide a section; assert the live payload (via the existing live-scene test hook) omits those tokens.
- Assert the live payload has no `kind` key.

## 2. Terrain and cover on props

### Data model (additive)

```ts
export interface TokenTerrain {
  /** Difficult terrain: movement costs double. Marker only. */
  difficult?: boolean
  /** Cover a creature gets behind this prop. Marker only. */
  cover?: 'half' | 'three-quarters'
  /** The prop blocks movement. Marker only. */
  blocks?: boolean
}
// on SceneToken
terrain?: TokenTerrain
/** Footprint in cells for a prop that is not square; falls back to `size`. */
w?: number
h?: number
```

Only tokens whose kind resolves to Props show the Terrain controls. Nothing computes with these values: no cost, no cover bonus, no blocked path. They are labels for the table.

### Footprint

`size` stays the square footprint, so all existing tokens render as before. A prop can set `w` and `h` (1 to 12 cells) for a table (2×1) or a wall (6×1). When `w` or `h` is set, the board draws the prop as a rounded rectangle on whole cells and the hit area matches. The token editor shows a Size field for characters and enemies, and Width and Height fields for props. Rotation is out of scope.

### What the DM sees

- A tag on the inspector row: "Difficult", "½ cover", "¾ cover", "Blocks".
- On the map, a footprint under the token: a hatched diagonal fill for difficult terrain, a "½ COVER" or "¾ COVER" chip on its edge, and a solid dark outline for blocks. The token stays on top and selectable.
- The editor's Terrain group has a switch for difficult, a three-way control for cover (None, ½, ¾), and a switch for blocks.

### What players see

Terrain is table information, so sharing it is useful, but the live token table has no column for it. Two options, and the owner decides:

- **A (recommended): share, with one additive migration.** Add `terrain jsonb` and `cell_w`/`cell_h integer` (nullable) to `shared_scene_tokens`. Players then see the hatch and chips. The owner runs the SQL before the PR merges to `dev`, as in the release flow. Old clients ignore the new columns.
- **B: DM only at first.** Terrain draws only for the DM and in "Preview as player" it disappears. No migration.

Either way, hidden props stay withheld.

### Phone and keyboard

Terrain controls use 38 px targets in the editor. On a phone the chip shrinks to "½" so it does not cover a small cell. The hatch is a CSS pattern and does not need hover.

### E2E

Set difficult and ½ cover on a crate; assert the tag, the chip and the hatch in both browsers; assert the live payload follows the option the owner picks; assert an old scene without `terrain` renders unchanged.

## 3. Selected-token card

### Data (read only, from app data)

A card at the bottom of the inspector, shown when exactly one token is selected. It reads, in this order, and shows only what exists:

| Field | Source |
| --- | --- |
| Name, type chip | `SceneToken.label`, `resolveKind` |
| HP | linked `Combatant.hp` and `maxHp` |
| AC | `Combatant.ac`, else the NPC's `statBlockData.ac`, else the character's `ac` |
| Speed | token's manual speed (see 4), else the stat block's `speed` text |
| First attacks | the first two entries of `statBlockData.actions` (name and the first sentence of the text) |
| Link | **Open stat block**, which calls the existing peek (`setPeek({ kind: 'npc', id })`) |

A token with no stat block shows name, type and HP, and no empty rows. A Props token shows its terrain tags and size instead. Nothing here is new data and nothing is invented: Monster records from `src/lib/monsters.ts` fill the same fields when a token came from the monster picker.

### What the DM sees and what players see

The card lives only in the DM inspector. Players never receive it, and it does not change the player view.

### Phone and keyboard

In the phone drawer the card is sticky at the bottom of the scroll area and collapses to one line (name, HP) with a tap to expand. The **Open stat block** button is 38 px or taller. The card is a `region` landmark labeled with the token's name so a screen reader announces the selection.

### E2E

Select an NPC token with a stat block; assert HP, AC, speed and two actions. Select a bare label token; assert only name and type show. Click **Open stat block**; assert the peek opens.

## 4. Movement range ring

### Data

```ts
// on SceneToken
/** Manual walking speed in feet; overrides the stat block. */
speedFt?: number | null
```

Speed resolves as: `speedFt`, then the walk speed parsed from the linked stat block text ("30 ft., fly 60 ft." gives 30), then a linked character's `speeds.walk`. If none exists, the ring and the toggle for that token stay hidden. A **Speed (ft)** field sits in the token editor and in the card.

The grid's feet per square stays 5, the value the ruler and templates already assume. A later `SceneGrid.ftPerCell` can replace the constant. Squares = floor(speed / 5).

### Diagonal rule

Default: **every square costs 5 ft, diagonals included**. This is the rule the ruler already uses, so the two tools agree. The ring is a rounded square of radius `squares` around the token. An option **5-10-5 diagonals** (the toggle's menu, off by default) draws the octagon where every second diagonal costs 10 ft. No terrain, wall or token blocks the ring; it is a guide.

### What the DM sees

A soft accent ring or cell fill under the selected token, and while dragging it, centered on where the drag started so the DM sees how far the token may go. A **Range** toggle sits in the tool rail's view group and the shortcut is `R` (confirm it is free before building). The toggle state is a per-browser preference, not part of the scene.

### What players see

A player sees a ring for their own token on their own turn, and never one for another token. The ring is computed on the player's device from data the player already has: their token's position, and a speed the DM chose to share. A new optional `speedFt` on the live token would need an additive column, so the first build shows the player's ring only for a token that has a manual `speedFt`, sent as part of the same additive `shared_scene_tokens` migration as terrain (`speed_ft integer`, nullable). A token without a speed shows no ring.

Each player can hide the ring for themselves. The player view has a **Range ring** toggle (rail button and the `R` key), on by default. The choice is stored per player in `localStorage` and never reaches the DM or other players. This is for immersion; the DM's own toggle is separate.

### Phone and keyboard

On touch the ring shows for the selected token and during a drag. The toggle is a 38 px rail button. `R` toggles it, and the speed field accepts typing and arrow keys in steps of 5.

### E2E

Select a token with speed 30; assert a ring of 6 squares (by the overlay's `data-squares`). Remove the speed; assert no ring. Toggle off; assert it disappears. In the player view, assert the ring shows only on the player's own turn, never for another token, and that the player's toggle hides it and survives a reload. Cover both browsers.

## 5. Template presets

### Data

`SceneTemplate` keeps `circle | cone | line` and gains one shape and one optional field:

```ts
export type TemplateShape = 'circle' | 'cone' | 'line' | 'cube'
// on SceneTemplate
/** Line width in feet; 5 when unset. */
widthFt?: number
```

`label` already exists and shows on the placed template.

### Presets

A small static list in `src/data/templatePresets.ts`:

- Cone 15 ft, Cone 30 ft.
- Sphere 10, 20 and 30 ft radius.
- Line 30 × 5 ft.
- Cube 10 ft.

The app has no spell database (spells exist only as `CharacterSpell` entries on character sheets and as text in stat blocks, from T-35). So spell names are optional labels, not data: the preset menu has a "Spell (optional)" field with suggestions drawn from the selected token's stat block `spellcasting` entries and the linked character's `CharacterSpell` list, plus a short built-in list of common area spells with their shape and size (for example Burning Hands, Fireball, Thunderwave). Picking a spell arms the matching shape and size and sets the label. The DM can type any name.

### What the DM sees and what players see

The existing tool keeps working: Circle, Cone and Line buttons, a size field, a color. Presets appear as a row of chips under the shape buttons. Placed templates keep syncing through `shared_scenes.templates`, so players see the shape and its label. A new `cube` shape on an old client renders nothing, so the new shape does not break a player on a stale tab.

### Phone and keyboard

Preset chips are 38 px and scroll sideways. The spell field is a plain text field with a suggestion list.

### E2E

Arm "Cone 30 ft", place it, assert the size and label. Pick a suggested spell; assert the label. Reload; assert it persists. Assert a player view receives the label.

## 6. Grid opacity and light level

### Data (additive, no migration)

Both values ride in `SceneGrid`, which already syncs to players in `shared_scenes.grid` (a JSON column), so no store and no Supabase change are needed:

```ts
// on SceneGrid
/** Grid line opacity, 0.1 to 1. Unset keeps today's look. */
opacity?: number
/** Ambient light over the map. Unset = bright. */
light?: 'bright' | 'dim' | 'dark'
```

Putting light in `SceneGrid` is a shortcut to avoid a migration. A cleaner home is a top-level `shared_scenes.light` column (one additive line). That is an open question.

### What the DM sees

- **Grid tab:** an opacity slider with a live number, applied to the grid layer.
- **Map tab:** an **Ambient light** control with Bright, Dim and Dark. Dim overlays a warm dark tint at about 35%, Dark a cool dark tint at about 60%. The tint sits above the map image and grid and below tokens and templates, so tokens stay readable. Fog stays above the tint.
- The DM view shows the tint at reduced strength so prep stays readable, with a small "Players see full dim" label.

### What players see

The same tint at full strength, shared through the scene. Recommended: shared, because the tint is the point of the control. A DM-only option adds nothing the DM cannot already see.

### Phone and keyboard

The slider is a native range input with a 38 px thumb area. Light is a three-button segmented control with `aria-pressed`. Arrow keys change the slider in steps of 5%.

### E2E

Change opacity; assert the grid layer's style. Set Dim; assert the overlay exists in the DM view and in the player live view. Assert old scenes without the fields render as today.

## Conflicts and sequencing

| Work in flight | What it touches | How this design avoids a clash |
| --- | --- | --- |
| T-99 token delete and undo | `BattleMapPage.tsx`, `Tabletop.tsx`, `combat.ts` | Phase 1 and 2 edit `Inspector.tsx` and the `tokenGroups` block (about 30 lines at `BattleMapPage.tsx:1351`). Start them after T-99 merges to `dev`, then rebase. Bulk actions go through the same token setter T-99's undo wraps, so they undo as one step. |
| T-100 players in initiative | `hiddenFromPlayers`, live combat tables | The bulk eye changes `hidden` only. `kind` stays out of every live payload. |
| T-102 map pings | `Tabletop.tsx` | Board work (range ring, terrain, tint, opacity) goes in one new `BoardOverlays` component and reaches `Tabletop.tsx` through a single new prop and one render line. Start it after T-102 merges. |

## Build order

1. **Phase 1 (M): token categories.** Types, `resolveKind`, chips, sections, bulk actions, Type selector, tests. Inspector side only.
2. **Phase 2 (S): selected-token card and manual speed field.** Reads existing data.
3. **Phase 3 (S): grid opacity and light level.** Uses the overlay component and `SceneGrid`.
4. **Phase 4 (M): movement range ring.** The first piece in `BoardOverlays`.
5. **Phase 5 (M to L): terrain, cover and prop footprint.** The largest board change (rectangular tokens), plus the migration if the owner picks option A.
6. **Phase 6 (S to M): template presets.**

This moves terrain (the owner's second priority) after the cheaper board pieces because it changes how `Tabletop.tsx` draws and hit-tests tokens. The owner can swap phases 3 to 5 if terrain matters more.

Each phase is its own PR against `dev`, and each stays within the 38 px touch target and the drawer behavior above.

## Owner decisions

The owner approved every recommendation:

1. Players see terrain and cover markers. One additive migration is needed (`shared_scene_tokens`: `terrain jsonb`, `cell_w integer`, `cell_h integer`, `speed_ft integer`, all nullable). The owner runs the SQL before the phase 5 PR merges to `dev`.
2. Light level lives in the grid JSON (`SceneGrid.light`), with no column.
3. "Add from NPC" defaults to Enemy.
4. Range diagonals cost 5 ft per square, with 5-10-5 as an option.
5. Players see their own ring on their own turn, and each player can hide it with a per-player toggle.
6. Built-in common area-spell names are acceptable as optional labels.
7. Build order stays as listed.
