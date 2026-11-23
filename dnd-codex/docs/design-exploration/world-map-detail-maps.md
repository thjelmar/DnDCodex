# World map detail maps (T-94)

Status: approved by the owner and built (T-94).

## Goal

The owner's request: a pin on the world map can open a more detailed map, such as a
town. Opening it zooms in dramatically. A button closes the detail map and returns to
the larger map.

## What exists today

- `WorldMap` is one record per campaign (`getOrCreateWorldMap` takes the first row for
  the campaign). `WorldPin` holds `x`, `y`, `label`, `color`, and an optional `ref` to a
  Location, NPC, or race group.
- `WorldMapCanvas` is a pan and zoom board with a single `{k, tx, ty}` transform. The DM
  editor and the read-only player view both use it.
- The player share view uses one row in `shared_world_maps` (primary key
  `campaign_id`) for the pins and metadata. The picture rides `shared_images` with
  `kind = 'worldmap'`.
- In the player view, clicking a pin does nothing today.

## Decisions

### 1. Data model

A pin references a child world map. A map can have a parent map, so nesting works later.
This release ships one level in the UI.

```ts
interface WorldPin {
  // existing fields…
  /** The detail map this pin opens, or undefined for a plain pin. */
  detailMapId?: Id
}

interface WorldMap extends BaseRecord {
  // existing fields…
  /** Set on a detail map: the map it belongs to. Absent on the campaign's root map. */
  parentMapId?: Id | null
}
```

- The root map is the one without `parentMapId`. `getOrCreateWorldMap` and the Overview
  hub card (`newestWorldMap` in `useOverviewData.ts`) filter to root maps, so a detail
  map never becomes "the world map".
- A pin stores only `detailMapId`. The child stores only `parentMapId`. Two pins can open
  the same detail map (for example, two pins for one city). That is also how
  "pick an existing map" works.
- Pins inside a detail map use the same `ref` link to Locations and NPCs as today.
- **Add a detail map.** In the pin inspector, a **Detail map** section has two actions:
  **Upload image** (creates a child map named after the pin label, using
  `processImageFile(file, 2400)`) and **Use existing map** (a menu of the campaign's other
  detail maps). Once a pin has one, the section shows the map name (editable), **Open**,
  **Replace image**, and **Remove detail map**.
- Pins inside a detail map do not offer **Add detail map** in this release (one level).
  The data model and the zoom code already handle deeper nesting, so a later release
  only needs to enable the button.
- **Delete a pin that has a detail map.** The DM confirms: "Also delete the detail map
  *Caldemar*?". If no other pin references the map, deleting removes the child map, its
  image, and (recursively) its own children. If another pin still references it, the map
  stays.
- **Remove detail map** (inspector button) clears `detailMapId` and applies the same
  "delete if no longer referenced" rule, with the same confirm.
- **Delete a map.** `deleteWorldMap` deletes the descendants and clears `detailMapId`
  on any pin that pointed at it. `deleteCampaign` already removes every `worldMaps` row
  by `campaignId`, so the cascade needs no change. Detail-map images are
  `StoredImage` rows and are deleted with their map, so no orphans.
- **Sync.** Both new fields are optional JSON inside the existing synced `worldMaps`
  record. No change to `syncKinds.ts`. Old clients ignore unknown fields.

### 2. Dexie

No new index is needed: detail maps are found by filtering `campaignId` rows in memory
(a campaign has a handful of maps). The proposal therefore adds **no new Dexie version**.
If review wants a `parentMapId` index, the next version is **v23**
(`worldMaps: 'id, campaignId, name, parentMapId, updatedAt'`), additive, and it must take
its number in merge order.

### 3. The zoom

Navigation state lives in the URL, so the browser back button works on both views:

- DM: `#/campaign/:id/worldmap?map=<detailMapId>`
- Player: `#/player/:id/worldmap?map=<detailMapId>`

A new `WorldMapStage` component stacks one `WorldMapCanvas` per open map. The parent
canvas stays mounted underneath, so its pan and zoom are restored exactly on close.

**Open (about 750 ms, `cubic-bezier(0.65, 0, 0.35, 1)`):**

1. Read the pin's screen position in the parent canvas.
2. Scale the parent layer up to about 6×, with `transform-origin` on the pin, while it
   fades to 0.
3. At the same time the detail layer mounts at 20% scale on that same point, grows to 100%,
   and fades in. The detail map appears to grow out of the pin.

**Close** plays the same animation in reverse. The **Close** button restores the parent
transform because the parent never unmounted.

**Controls and rules**

- A **Close** button (arrow plus "Close") sits top left while inside a detail map. It is
  always visible, even mid-pan, and has a 44 px target.
- A breadcrumb shows next to it: "Realm of Caldemar / Caldemar". The first part is a
  button that also closes.
- Escape closes (unless focus is in a text field). The browser back button closes.
  Opening pushes one history entry; **Close** goes back one entry when the user arrived
  in-app, and replaces the URL when the page loaded directly on `?map=`.
- **Which gesture opens.** Player view: tap or click the pin. DM editor: single click
  still selects the pin (so drag and edit keep working); **Open** in the inspector,
  double-click, or Enter on the focused pin opens it.
- A pin with a detail map shows a small map glyph beside its label. A pin without one
  keeps today's behavior (selects in the editor; does nothing in the player view).
- `prefers-reduced-motion: reduce`: no scaling, a 200 ms cross-fade only.
- Touch: pin and button targets are at least 38 px (the **Close** button is 44 px). Pinch
  and pan work inside the detail map because it uses the same canvas.
- If a pin's `detailMapId` points at a map that no longer exists (for example, a player
  view that has not synced yet), the pin behaves as a plain pin.
- Colors use the existing CSS variables (`--accent`, `--panel`, `--border`, `--text`).
  New CSS goes in one block headed `/* World map detail maps (T-94) */` at the end of
  `styles.css`, to limit merge conflicts.

Mockup of the detail view:

```text
┌───────────────────────────────────────────────────┐
│ [← Close]  Realm of Caldemar / Caldemar     [+ − Fit]│
│                                                   │
│        (town map image)        ◉ Guildhall        │
│                    ◉ Market                       │
└───────────────────────────────────────────────────┘
```

I did not use Stitch: this is a motion and state change on a screen that already follows
the design language, and a static mockup would not show the part that matters.

### 4. Players and Supabase

Yes, this needs one additive migration. `shared_world_maps` is a single row per campaign,
so detail maps ride a new nullable-by-default column on that row. No new table, no RPC,
and no new `SECURITY DEFINER` function, so nothing needs `revoke ... from anon`. The
existing owner-write and member-read policies and the realtime publication already cover
the column.

Hand this SQL to the owner (it is idempotent and additive). The next free number on `dev`
is 0044. The battle map session may also use it, so the hub renumbers at merge time.

```sql
-- T-94: detail maps for the shared world map. The root map's pins stay in
-- `pins`. Detail maps ride one extra jsonb array of
-- { id, parentMapId, name, imageId, width, height, pins }.
-- Their pictures use shared_images (kind = 'worldmap'), like the root picture.
-- Additive: old clients ignore the column. Run in Supabase -> SQL Editor.

alter table public.shared_world_maps
  add column if not exists detail_maps jsonb not null default '[]'::jsonb;
```

Client changes:

- `shareWorldMap` also sends `detail_maps` (all descendants of the root, with pins).
- `getSharedWorldMap` reads it (missing or non-array becomes `[]`).
- `pushShare` shares each detail map's image through `shareImageToCampaign(..., 'worldmap')`.
- `stopShare` unshares every detail image, not only the root's.
- `PlayerWorldMapPage` looks up the image for whichever map is open. It already
  re-fetches on realtime changes to both tables.
- Before the owner runs the SQL, an updated DM client that shares would get an error on
  the unknown column. The hub should hand over the SQL before the PR merges to `dev`
  (the repository rule already says so).

### 5. Risks

- **Editor autosave clobber.** The editor loads `pins` into state once per map and saves
  after 400 ms. With several maps, state must be keyed by the open map. Switching maps
  flushes the pending save first, then reloads state. This is the highest-risk change.
- **Image weight on the shared database.** Each shared detail image is a base64 row in
  `shared_images` (up to 2400 px), and the player fetch lists all `shared_images`.
  T-80 and T-81 already track moving these to Storage. I propose 2000 px for detail
  images and a soft limit of 8 detail maps per campaign until T-81 lands.
- **Animation cost on phones.** Only `transform` and `opacity` animate on the two layers;
  the image is not re-laid out per frame. The pin overlay is part of the scaled layer.
- **Share drift.** Detail maps share only when the DM presses **Update**, like the root
  map. The **Update** label stays as is. The share panel notes how many detail maps it
  sends.
- **Hub card regression.** The Overview card must show the root map only (covered by an
  e2e check).

### 6. Build plan and e2e

Files: `db/types.ts`, `db/repo.ts`, `auth/cloud.ts`, `components/WorldMapCanvas.tsx`,
a new `components/WorldMapStage.tsx`, `pages/WorldMapPage.tsx`,
`pages/PlayerWorldMapPage.tsx`, `lib/useOverviewData.ts`, `data/demoSeed.ts` (give
the Realm of Caldemar pin "Caldemar" a detail map with three pins), `styles.css` (one
named block), a new `e2e/world-map-detail.spec.ts`, and the What's New entry (release
session).

Tests:

1. Editor: add a detail map to a pin by upload, open it by double-click and the
   **Open** button, check the breadcrumb, add a pin linked to a Location, press **Close**,
   and confirm the parent pan and zoom match the earlier values.
2. Editor: Escape and browser back close the detail map. A direct load of `?map=` works.
3. Editor: delete a pin with a detail map (confirm) and confirm the child map and its
   image are gone. A second pin that shares the map keeps it.
4. Reduced motion: with `reducedMotion: 'reduce'`, the open animation uses no transform.
5. Player share view (injected `SharedWorldMap` with `detailMaps`): tap opens, **Close**
   returns, a pin without a detail map does nothing.
6. Overview hub card still shows the root map.
7. Existing tests pass, in Chromium and WebKit, plus the phone viewport. Manual preview
   check on the demo at desktop and phone width.

Not tested by e2e: the live Supabase round trip for `detail_maps` (needs the migration;
verify on the dev site after the owner runs the SQL).

## Owner decisions

1. A single click on a pin in the editor selects it. Double-click, Enter, or **Open** in the
   inspector zooms in. Approved.
2. Deleting the last pin that points to a detail map deletes that map, after a confirm.
   Approved for now. A later release should offer **Delete** or **Keep**. A kept map would
   live in a "maps" location that stores the maps and each parent and child relationship.
   That is not built, and the model allows it: `detailMapId` and `parentMapId` are separate,
   so a detail map can exist with no pin that points to it.
3. One nesting level in the UI is enough. A later "Realm map" above the world map would make
   it two levels deep. It is not built, and the model and the stage already nest.
