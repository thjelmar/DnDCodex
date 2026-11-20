# Overview edit mode: design

Status: Phase 1 (design only). No app code, no migration, nothing committed.
Date: November 20, 2026. Branch: `claude/loving-archimedes-f7ab45`, cut from `origin/dev` at `9623e8a`.

## Summary

Add an **Edit layout** mode to the campaign Overview. In this mode you can
move each card, change its width, hide it, and add hidden cards back from a
tray. The layout is one **ordered list of cards with a width each**. Heights
stay automatic. The layout is saved per user (not per campaign), syncs through
the existing `user_records` channel, and needs no SQL migration. The edit code
loads lazily and uses no new dependency.

The main choice is "order plus width" instead of a free-form grid. A free-form
grid fights this page: the cards hold rich text, lists and images whose height
changes, and Tab order must equal visual order (a tested guarantee). A flow
grid keeps both true by construction.

## What exists today

Facts read from the code on `dev`:

- `src/pages/OverviewPage.tsx` builds six keyed blocks (`next`, `hub`, `world`,
  `recent`, `prep`, `side`) and renders them in a different array order per
  width (`wide ? [next, hub, world, recent, prep, side] : [next, world, hub, ...]`).
  The order is chosen with `useMediaQuery('(min-width: 961px)')`.
- `src/styles.css` (around line 4482) defines `.ov-bento` as a 12-column grid.
  On a phone every block spans the full width in DOM order. At 961px and wider,
  blocks get explicit `grid-column` and `grid-row` values, with World overview,
  Recent and the prep area in 8 columns and the side card in 4 columns spanning
  3 rows.
- `CollapsePanel` (open or closed, closed body stays mounted and `hidden`) wraps
  World overview, Links, Voice and the four hub cards. Its default open state
  is read once at mount.
- `HubCards` renders one `.ov-hub` grid of four cards. `CampaignPrep` renders
  the prep checklist and the recently edited feed together.
- The only rich editor on the page is the read-only `RichTextEditor` inside the
  World overview card. T-71 (an intermittent crash on load) is open, and
  `e2e/overview-hub-images.spec.ts` retries the load once because of it.
- Tests that encode the layout: `overview-layout.spec.ts` (columns, side
  column x position, phone stack, `aria-controls`), `overview-hub.spec.ts`
  (reading order at 1440px and 375px, Tab order, resize across the breakpoint
  keeps panel state), `overview-prep*.spec.ts`, `overview-hub-images.spec.ts`.
- **Player campaigns do not use this page.** `App.tsx` and `HomePage.tsx` route
  a campaign with `role === 'player'` to `/player/:id`. The Overview is the DM's
  command center only, so there is one audience for edit mode.
- Per-user data that follows the account uses the global channel:
  `globalSync.ts` mirrors Dexie tables in `GLOBAL_SYNC_TABLES` (`templates`,
  `genTables`, `duelHistory`) to `user_records` rows keyed `(owner_id, kind, id)`.
  Conflicts are last-write-wins on each record's `updatedAt`, with tombstones.
  `user_records.kind` is free text (migration 0036), so a new kind needs no SQL.
  The demo sets the sync user to null (`SyncProvider`: `isDemo() ? null : ...`),
  so demo data stays in Dexie only.
- `lib/prefs.ts` and `lib/theme.ts` are per-browser `localStorage`. They do not
  sync (theme syncs through `profiles`). They fit a one-line preference, not a
  layout that you want on every device.

## Dependencies on the other three sessions

The catalogue below assumes all three land. Edit mode only needs each block to
be a **self-contained card** with a stable id, so the order of merges matters
more than the content.

| Session | Change | What edit mode needs from it |
| --- | --- | --- |
| overview-collapse | A collapsed card shrinks to its title bar | Height stays automatic, so a collapsed card just gets short. Nothing else. |
| overview-world-first | World overview moves under the hero, possibly full width | World overview becomes one card with a default `span` of 12 and `order` 0 or 1. |
| overview-links-voice | Links and Voice merge into one card with two sections | One catalogue entry `links-voice` instead of two. |

Recommended merge order: **collapse, then links-voice, then world-first, then
edit mode**. Reasons:

1. Edit mode replaces the per-width array order and the explicit `grid-row`
   rules in `styles.css`. Any of the three that still edits those rules after
   edit mode lands will conflict with it. Landing them first means edit mode
   rewrites the final shape once.
2. The default layout is a literal list of the card ids in their shipped order.
   I write it from the merged result, not from a guess.
3. If one of them is late, edit mode Phase A (below) can still start: it only
   needs the card ids to be constants in one file, and adding or removing an id
   later is a one-line change that the "new card shows up" rule already handles.

I do not touch `CollapsePanel`'s open and closed logic, and I do not touch the
card contents.

## Card catalogue

Each card gets a stable string id that is never reused. `minSpan` and
`defaultSpan` are in 12-column units.

| Id | Card | Default span | Min span | Hideable | Notes |
| --- | --- | --- | --- | --- | --- |
| `world` | World overview | 12 | 6 | yes | Holds the read-only `RichTextEditor`. |
| `next` | Next session | 12 | 6 | yes | Date, poll and RSVP summary. |
| `prep` | Prep (hub) | 6 | 4 | yes | Split out of the single `hub` block. |
| `run` | Run (hub) | 6 | 4 | yes | |
| `lore` | World & Lore (hub) | 6 | 4 | yes | |
| `reference` | Reference (hub) | 6 | 4 | yes | |
| `recent-sessions` | Recent sessions | 8 | 4 | yes | |
| `prep-checklist` | Prep checklist | 8 | 4 | yes | Split out of `CampaignPrep`. |
| `recently-edited` | Recently edited | 4 | 4 | yes | Split out of `CampaignPrep`. |
| `links-voice` | Links and Voice | 4 | 4 | yes | One card, two sections. |

Two prerequisites that edit mode depends on, and that I list as Phase A work:

- **Split `hub` into four cards.** Today `HubCards` renders one `.ov-hub` grid.
  The owner asked to move and remove each of the four, so each becomes its own
  block with its own `CollapsePanel`. The shared data read stays in
  `useOverviewData`.
- **Split `CampaignPrep` into two cards** (checklist and feed) for the same
  reason.

The hero (`CampaignHero`) is not a card. It stays fixed above the grid and has
the **Edit layout** button, so the way back is always in the same place.

### Worth adding as cards later

These are cheap because the data already exists (`deriveHubCards` computes the
counts, and the old stat tiles showed them):

- **Counts strip** (sessions, NPCs, locations, items, notes, tables), one card
  with six tiles. Hidden by default. This answers "what else is worth being a
  card".
- **Quick actions** (New session, New NPC, Roll, Open Run mode).
- **Cover and tagline** or **Campaign settings shortcut**.
- **Calendar and next three sessions** (reads `nextSessionDate` and the poll).
- **Pinned notes** (needs a pin concept that does not exist; out of scope).

I recommend shipping only the counts strip as the first "extra" card, hidden by
default, so the tray is not empty on day one.

## 1. Interaction model

**Entering.** A button in the hero's action row: **Edit layout**
(pencil icon), next to **Campaign settings**. It toggles. While on:

- A bar appears under the hero: "Editing layout. Drag cards by the handle, or
  use the arrows. Changes save automatically." with **Done**, **Add card**
  and **Reset layout** buttons. It is a `role="region"` with an accessible
  name and gets focus when edit mode opens.
- Every card gets a toolbar on its top edge (see the text mockup below).
- The **Add card** button opens a side panel (the app's existing `SidePanel`)
  that lists hidden cards, each with a one-line description and an **Add**
  button. If nothing is hidden, the panel says so.

**Why not a persistent side panel or an always-on drag.** An always-on drag
means a mis-click moves things during normal use, and it would force the drag
handlers into the main bundle. A toggle keeps normal use identical to today.

**Changes save as you go**, not on Done. Done only leaves the mode. This
matches how every other setting in the app behaves and removes a "discard
changes?" dialog. **Reset layout** asks for confirmation (existing
`useConfirm`) and offers an **Undo** toast for 10 seconds (one level, kept in
memory).

**Per-card toolbar** (visible only in edit mode):

```
┌─ Recent sessions ───────── [⠿ Move] [↔ Width: 8/12 ▾] [✕ Hide] ┐
│  (card content is inert: not clickable, not focusable)          │
└──────────────────────────────────────────────────────────────────┘
```

- **Move** is a drag handle button (`touch-action: none` on the handle only,
  so the page still scrolls elsewhere).
- **Width** is a menu button with four steps: one third (4), half (6),
  two thirds (8), full (12), plus a drag handle on the card's right edge that
  snaps to those steps. Steps below a card's `minSpan` are disabled.
- **Hide** removes the card from the page and puts it in the tray. It does not
  delete data.

**Card content is inert in edit mode** (`inert` attribute on the card body).
That stops accidental clicks on links and checkboxes, and removes the content
from the Tab order, so keyboard users move across toolbars only.

### Keyboard and screen readers

Keyboard operation is the primary path, and the pointer drag is an addition
built on top of it (the reverse of most drag libraries).

- Each toolbar has three buttons in Tab order. Tab order equals visual order
  because the DOM order is the visual order (see section 7).
- On **Move**: `Arrow Up` or `Arrow Left` moves the card one position earlier,
  `Arrow Down` or `Arrow Right` moves it one position later. `Home` and `End`
  move it to the first or last place. Focus stays on the same button after the
  card moves (the card is keyed, so React moves the node without remounting it).
- On **Width**: `Enter` opens the menu; `Arrow Left` and `Arrow Right` on the
  button itself step the width down and up one step, without opening the menu.
- On **Hide**: `Enter` hides the card and moves focus to the next card's Move
  button (or to **Add card** if it was the last).
- A visually hidden `aria-live="polite"` region announces each result: "Recent
  sessions moved to position 3 of 8", "Recent sessions width is now one half",
  "Recent sessions hidden. 2 cards hidden."
- Pointer drag shows a drop marker line and does not change the DOM until
  release. A drag can be cancelled with `Escape`.
- All controls are at least 44 by 44 px on touch and keep the existing focus
  ring.

## 2. The grid

### Recommendation: ordered list plus width, automatic height

A layout is an ordered array. Each entry has a card id and a `span`
(4, 6, 8 or 12). Cards render in that order inside the existing 12-column
`.ov-bento` grid with normal auto-placement:

```css
.ov-bento { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; align-items: start; }
.ov-bento > .card { grid-column: span var(--span); }   /* no explicit rows, no `dense` */
```

Row-major auto placement means DOM order equals visual order (as long as
`grid-auto-flow: dense` is never used), so the Tab-order guarantee holds for
any layout. The explicit `grid-row` rules in `styles.css` go away.

At 960px and narrower every card is full width, in the same saved order. The
saved spans are ignored there (the phone behavior in section 6).

**Cards of different heights.** With `align-items: start`, a short card next to
a tall one leaves empty space under the short one. That is the cost of this
model. Two mitigations that I recommend:

- The default layout pairs cards of similar height (the hub cards in rows of
  two, the checklist next to the feed).
- Rows where all cards are in the same row stretch if you choose that
  (decision 6: stretch or top-align). I recommend top-align, because stretching
  makes a collapsed card look broken.

**Collapsed cards** (from overview-collapse) shrink to the title bar and keep
their span. Nothing in the layout model changes.

**Min and max.** Min is per card (catalogue above). Max is always 12.

### The alternative: free-form grid

Each card stores `{ x, y, w, h }` in grid units, and you can place a card
anywhere, with row heights in fixed units (for example 40 px). This is what a
dashboard builder (`react-grid-layout`) does.

| | Order plus width (recommended) | Free-form `x, y, w, h` |
| --- | --- | --- |
| Tab order equals visual order | Always, by construction | Not guaranteed. Needs a sort by `y` then `x` on every change, and the tested guarantee is easy to break. |
| Content-driven height | Yes. Text, lists and the image thumbnails grow naturally. | No. Fixed row units clip or force scroll inside cards. A hub card with images and a long checklist needs inner scrolling. |
| Collapsed cards | Shrink with no extra work | A collapsed card leaves a hole or needs compaction logic. |
| Keyboard operation | Four arrow keys, one dimension | Two dimensions plus collision rules. Much harder to make clear to a screen reader. |
| Phone | Same order, one column | Needs a separate mobile layout or a derived order. |
| Stale layout after a card changes | Trivial: reconcile a list | Overlap and gap repair. |
| Owner control | No free vertical placement, no fixed heights | Full control |
| Code | About 300 lines | A library or about 800 lines |

I recommend order plus width. It delivers the owner's request (drag, resize,
remove, add) in the way the owner described it, and it keeps the page robust.
The one thing it does not do is let you set a card's height. If a card must be
shorter, collapse it. Decision 1 asks the owner to confirm this trade.

## 3. Libraries

| Option | Fit | Size and upkeep | Touch and keyboard |
| --- | --- | --- | --- |
| **No dependency** (pointer events plus keyboard buttons, recommended) | Model is a 1-D ordered list with snapped widths. | 0 KB added. About 300 to 400 lines in a lazy chunk. | Keyboard is the primary path and is written first. Touch drag uses the pointer events API on the handle. |
| `@dnd-kit/core` 6.3.1 plus `@dnd-kit/sortable` 10.0.0 | Good for sortable lists. Has no resize. | Unpacked size 1.07 MB and 234 KB. My estimate for the minified, gzipped runtime is 10 to 15 KB, but I did not build it to measure. Last published December 2024. | Has keyboard and touch sensors and screen reader announcements. |
| `@dnd-kit/react` 0.5.3 | Newer rewrite. | Pre-1.0 (version 0.5.3), so the API can still change. | Same. |
| `react-grid-layout` 2.3.0 | Free-form grid. Only fits the alternative model. | Unpacked 479 KB. | Pointer-based. No built-in keyboard operation. |

Recommendation: write it by hand. The Overview needs one dimension of
reordering and four width steps, and the keyboard path (the part libraries
sell) is a few lines of `onKeyDown`. A dependency would still need a custom
width control and a custom keyboard mapping for the resize and hide actions,
and it adds a package that must be kept up to date with React. If the pointer
drag turns out rough on iOS Safari in Phase B testing, I can drop in
`@dnd-kit/sortable` for the pointer path only; the data shape and keyboard
path do not change. I could not run touch tests on a real phone from here, so
this is untested (see "Not verified").

**Lazy loading.** Everything edit-specific lives in
`src/components/overview-edit/` and is loaded with `React.lazy` when you press
**Edit layout**. The main Overview bundle only gets a small, always-loaded
"layout reader" (about 60 lines: load the saved layout, reconcile it, render in
order with `--span`). So normal use pays for the reader, not for the editor.

## 4. Persistence

### Where

One layout **per user**, shared by all of the user's campaigns. Reasons:

- It is a personal preference about how you like your command center, like
  theme and accent.
- Every campaign's Overview has the same cards, so one layout fits all.
- It avoids a layout that you have to redo for each new campaign.

Optional later: a per-campaign override (a **Use a different layout for this
campaign** toggle). I do not recommend building it first. It needs a second
record kind and a precedence rule. Decision 2 asks the owner.

### Storage and sync

A new Dexie store `overviewLayout`, keyed by a fixed `slot` (value
`'overview'`, the same trick `genTables` uses), added in the next Dexie version
(`this.version(22)`, additive). It joins the global channel:

- add `'overviewLayout'` to `GlobalSyncTable` in `src/db/types.ts`
- add it to `GLOBAL_SYNC_TABLES`, `TABLE_TO_KIND` (`'overviewLayout'`) and
  `GLOBAL_TABLE_KEY` (`'slot'`) in `src/lib/globalSyncKinds.ts`

No Supabase change and no SQL: `user_records.kind` is free text. Per the
project rule, two PRs that each add a Dexie store use consecutive versions in
merge order, so I check `db.ts` right before opening the build PR.

Conflict rule: last write wins on the record's `updatedAt`, which is the
channel's existing behavior. For a layout this is acceptable: two devices that
edit at the same time keep the later edit. I do not propose per-card merging.
The failure mode is that edits on a phone and a laptop within the same minute
overwrite each other, which I consider rare and low cost.

The demo is local only for free: the sync user is null in the demo, so the
record stays in Dexie. A new e2e check confirms the demo makes no Supabase
request (extending `demo-isolation.spec.ts`).

A signed-out user has the same behavior (Dexie only).

### Data shape

```ts
// src/db/types.ts
export interface OverviewLayoutRecord {
  slot: 'overview'                 // fixed key, the table has one row per user
  version: 1                       // schema version of `cards`
  cards: OverviewLayoutCard[]      // order = display order, top to bottom
  hidden: string[]                 // card ids the user removed (the tray)
  knownIds: string[]               // every card id that existed when this was last saved
  updatedAt: ISODate               // drives last-write-wins
}
export interface OverviewLayoutCard {
  id: string                       // stable card id, for example 'prep-checklist'
  span: 4 | 6 | 8 | 12             // width in 12-column units on wide screens
}
```

Example:

```json
{
  "slot": "overview", "version": 1,
  "cards": [
    { "id": "world", "span": 12 },
    { "id": "next", "span": 6 },
    { "id": "prep", "span": 6 }
  ],
  "hidden": ["lore"],
  "knownIds": ["world","next","prep","run","lore","reference","recent-sessions","prep-checklist","recently-edited","links-voice"],
  "updatedAt": "2026-11-20T10:00:00Z"
}
```

### Default layout and reset

The default is not stored. It is a constant `DEFAULT_LAYOUT` in code (card
order and spans written from the merged catalogue). A user with no record, or
whose record is deleted, gets the default. **Reset layout** deletes the record
(a tombstone, which syncs), so the user is back on the default and future
changes to the default reach them.

### New cards, removed cards, and a changed version

`reconcile(saved, catalogue)` runs on every load, in the reader, and is a pure
function with unit-style e2e coverage:

1. **Unknown id in `cards` or `hidden`** (card removed from the app): drop it.
2. **Catalogue id that is not in `knownIds`** (card shipped after the user last
   saved): insert it at its default position relative to the nearest earlier
   catalogue card that the user still shows, with its default span. It is
   visible, so new cards appear for customized users. A card that the owner
   wants hidden by default (the counts strip) carries `defaultHidden: true` in
   the catalogue, and goes to `hidden` instead.
3. **Id in `knownIds` and `hidden`**: stays hidden. This is how a card the
   user removed stays removed when a new card ships.
4. **Duplicate ids or a span below the card's `minSpan`**: keep the first, clamp
   the span.
5. **`version` greater than the app understands** (a newer device wrote it):
   ignore the record and use the default, and do not write over it until the
   user edits. **`version` lower**: migrate.
6. Reconcile never writes. It only shapes the render. The record updates
   only when the user edits, so opening the page cannot cause sync churn.

`knownIds` is the key to "new cards show up". Without it, a card missing from
`cards` is ambiguous: the user hid it, or it is new.

## 5. Roles and campaigns

- Players use `/player/:id`, a different page. Edit mode is for the DM Overview
  only. No role check is needed, and the layout record is not read in the
  player view.
- The layout is shared by all of a user's DM campaigns (section 4). The card
  contents stay per campaign.
- A user who is a DM in one campaign and a player in another has one layout
  record, used only on the DM Overview.
- An archived campaign shows the same layout. The **Next session** card
  already handles the archived state itself.

## 6. Phone

Edit mode on a 375px screen is hard for resize and drag. Recommendation:

- **Hide, show, and reorder are available** on a phone, using the up and down
  buttons on each card's toolbar (the same keyboard actions, as buttons). No
  drag and no width control, because every card is full width at 960px and
  narrower.
- **Widths are ignored on a phone** but kept in the record, so a layout set up
  on a laptop carries over when you return to the laptop.
- The tray opens as a bottom sheet (the existing `SidePanel` already adapts).
- The **Edit layout** button stays in the hero actions. On a phone the toolbar
  buttons are 44 by 44 px.

This gives phone users the reorder and hide actions that matter, and avoids the
hardest touch interaction. Decision 5 asks if the owner wants more.

## 7. Interaction with the existing code

**Per-width order and Tab order.** Today the page picks one of two array orders
with `useMediaQuery`. After this change the saved order is the single source of
truth, and both widths use it: the DOM order is the saved order, and CSS
only changes the width (span 12 on a phone, the saved span on a wide screen).
The tested guarantee (Tab order equals visual order) then holds at both widths
by construction, which is a simplification, but it changes one product behavior:
**on a phone the default order can no longer differ from the wide order.** Today
the phone puts World overview before the hub cards, and wide puts the hub
cards first. With overview-world-first, both widths put World overview first,
which removes the difference. That is the reason for landing world-first
before edit mode. If the owner wants a different order on a phone, that is a
separate `phoneCards` list, which I do not recommend (decision 5).

**`useMediaQuery` reordering** is deleted from `OverviewPage` in Phase A. It
stays in `CollapsePanel` for the default open state.

**Lazy `RichTextEditor` and T-71.** The World overview card holds the editor.
The design avoids unmounting it in three ways:

- Cards are rendered as keyed siblings from one array. A reorder moves the
  existing DOM node and never remounts it (the existing comment in
  `OverviewPage` already relies on this).
- **Hide** unmounts the card. The editor remounts when you add the card back.
  To avoid a T-71 crash from a mount cycle, the card is hidden with the
  `hidden` attribute, and unmounted only after you leave edit mode. While in
  edit mode, hidden cards stay mounted but are not displayed. The tray lists
  them. When you press **Done**, the page renders only the visible cards, so
  hidden cards never mount again on normal loads.
- Entering and leaving edit mode does not remount cards: the toolbar is added
  around each card, as a sibling inside the same keyed wrapper, so the card
  element keeps its place.

I cannot rule out that T-71 is triggered by a plain first mount, which this
design does not change. The reader renders in the same place as today, so
T-71 is neither made worse nor fixed.

**e2e tests that encode the layout.** These change in Phase A, when the explicit
rows go away:

- `overview-layout.spec.ts`: "splits into main and side columns" expects World
  overview in the left two thirds and Links in the right third. Under the new
  default layout (World full width) the expectation is rewritten to the default
  spans. The phone tests (stack, `aria-controls`) should pass unchanged.
- `overview-hub.spec.ts`: the order and Tab-order tests are rewritten against
  `DEFAULT_LAYOUT`, and a new test applies a custom layout and checks Tab order
  again at 1440px and 375px.
- The collapse, links-voice and world-first sessions will also edit these
  files. This is the second reason for the merge order above.

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| You hide every card and cannot get them back | The hero (with **Edit layout**) is not a card and always renders. If every card is hidden, the page shows an empty-state card: "All cards are hidden. **Add card** or **Reset layout**." The tray and Reset work from there. |
| A saved layout references a removed card | `reconcile` rule 1 drops unknown ids. |
| A new card is invisible to customized users | `knownIds` (rule 2). Tested. |
| Sync conflict between devices | Last write wins on the whole record. Documented, accepted. |
| A newer device writes a newer `version` | Older app ignores it and shows the default (rule 5). |
| Edit mode breaks Tab order | DOM order is the saved order. A new e2e test presses Tab through a shuffled layout at both widths. |
| Accidental clicks on card content while editing | `inert` on card bodies. |
| Pointer drag feels wrong on iOS Safari | Keyboard and button path works without drag. Fallback to `@dnd-kit/sortable` for the pointer path only. |
| T-71 crash around mounts | Do not unmount cards while in edit mode (section 7). |
| Page layout jump when the saved layout loads after first paint | The reader reads Dexie before rendering the grid (a single `useLiveQuery` with a loading state that renders the default), and the default is the same as the saved layout for users who never edited. |
| Two PRs add a Dexie store at once | Re-check `db.ts` before opening the build PR and use the next version. |

## Phased build plan

Each phase is mergeable alone, behind no flag (the visible change is small
until Phase C).

| Phase | Scope | Effort | Ships |
| --- | --- | --- | --- |
| A. Card registry | Split `hub` into four cards and `CampaignPrep` into two. Add `cardCatalogue.ts` (ids, titles, min and default spans), `DEFAULT_LAYOUT` and `reconcile()`. Render the Overview from the default list with `--span`. Delete the per-width order and explicit rows. Update the layout e2e specs. No saved data yet. | 1 to 1.5 days | Overview looks the same or slightly different (World full width), with the structure ready. |
| B. Save and read | `overviewLayout` Dexie store (version 22), global sync kind, the layout reader hook, tombstone for reset. e2e: save, reload, sync-record shape, demo makes no Supabase call, `reconcile` cases (removed card, new card, hidden card). | 1 day | No UI yet. A developer can set a layout in the console. |
| C. Edit mode | Lazy `overview-edit` chunk. **Edit layout** button, bar, per-card toolbar, keyboard move, width menu, hide, tray (**Add card**), **Reset layout** with confirm and undo, live-region announcements, `inert` bodies, empty state. Phone: buttons only. e2e: keyboard move and Tab order at both widths, hide and re-add, reset, all-hidden recovery, 375px. | 2 to 3 days | The feature, keyboard and phone complete. |
| D. Pointer drag and resize handle | Pointer-event drag on the handle with a drop marker, edge resize snapping to the four steps. e2e: mouse drag (Playwright mouse API). Touch is checked by hand. | 1 to 1.5 days | The direct-manipulation feel the owner described. |
| E. Extras | Counts strip card (hidden by default), a "Layout" entry in Preferences for **Reset layout**, optional per-campaign override if the owner asks. | 0.5 to 1 day | Polish. |

Total: about 6 to 8 working days. The first useful result for the owner is
Phase C (about 4 days in).

**e2e plan.** All local, no backend, in `e2e/overview-edit.spec.ts` (new):

1. Edit layout on and off; focus lands in the bar; **Done** returns focus to
   the button.
2. Keyboard: move a card with the arrow keys; the DOM order, the visual order
   and the Tab order agree at 1440px and 375px.
3. Width steps by keyboard; the card's `grid-column` span changes; below
   `minSpan` is disabled.
4. Hide, then add back from the tray; focus ends on a sensible control.
5. Hide all cards; the empty state shows; **Reset layout** recovers.
6. Reload keeps the layout. A record that lists a removed card and lacks a new
   card renders correctly (seed through Dexie).
7. The demo writes the layout locally and makes no Supabase request.
8. Reduced layouts: the World overview editor does not remount when you move
   it (a `data-mounted-at` marker stays the same), covering the T-71
   concern.
9. Run edit mode on a 375px viewport: buttons only, no width control, no
   sideways scroll.

## Prototype

I did not build one. The riskiest piece is touch drag on iOS, which a desktop
throwaway page cannot settle, and the design does not depend on it: the
keyboard and button path is complete without drag. Phase D carries the pointer
work and its own check on a real phone.

## Not verified

- The gzip size of `@dnd-kit` (estimate only; I did not build it).
- Touch behavior on a real phone, and iOS Safari pointer events.
- That T-71 is unaffected. It is intermittent and I did not reproduce it.
- That the merged state of the three other sessions matches the catalogue.
  The catalogue is from your brief and the code on `dev`, and Phase A rewrites
  it from the merged result.
- No tests were run. I made no code changes.

## Updates after approval (November 20, 2026)

These supersede the matching text earlier in this document.

- **Row heights (decision 6, changed by the owner).** Cards in a row are equal
  height by default, and a collapsed card still shrinks to its title bar
  (PR #150: `.ov-bento` uses `align-items: stretch`, `.ov-cell` is a flex column,
  and `.ov-cell:has([aria-expanded='false']) { align-self: start }`). Moving,
  hiding or resizing a card changes which cards share a row, so the row heights
  change with the layout. That is expected.
- **Problem for edit mode (Phase C).** The `:has()` opt-out matches any element
  inside a cell that has `aria-expanded="false"`. Edit-mode controls must not use
  that attribute: a closed **Width** menu button with `aria-expanded="false"`
  would make every card shrink to its content while you edit. Phase C uses
  either controls without `aria-expanded` (a radio group or a native `select`
  for the width) or narrows the selector to
  `.ov-cell:has(.ov-panel-toggle[aria-expanded='false'])`. I recommend doing both:
  narrow the selector, and keep `aria-expanded` off the toolbar anyway.
- **Storage key.** The cloud `user_records.id` column is a `uuid`, so the layout
  record cannot be keyed by the string `'overview'`. The Dexie store
  `overviewLayout` is keyed by `id`, a fixed UUID (`OVERVIEW_LAYOUT_ID` in
  `src/lib/overviewCards.ts`), and the same value is the cloud row id. The data
  shape is the one above with `id` in place of `slot`.
- **Dexie version.** The store is added in version 22 (version 21 was the
  latest on `origin/dev` at `d6e85e3`).

## Testing a saved layout by hand (Phase B has no editing UI)

On a local dev server (`npm run dev`), signed out or signed in, open the DevTools
console on a campaign Overview and run:

```js
const repo = await import('/src/db/repo.ts')
await repo.saveOverviewLayout({
  cards: [{ id: 'recent-sessions', span: 12 }, { id: 'run', span: 6 }, { id: 'prep', span: 6 }, { id: 'world', span: 12 }],
  hidden: ['lore', 'reference', 'next', 'prep-checklist', 'recently-edited', 'links-voice'],
})
```

The page updates immediately and keeps the layout after a reload. To go back:

```js
await (await import('/src/db/repo.ts')).resetOverviewLayout()
```

The module import only works on the dev server. On the deployed dev site, write
the record to IndexedDB directly (database `dnd-codex`, store `overviewLayout`,
key `0b6f2f5e-7a1c-4c3e-9d52-6f1a8e4c0001`). In the demo, saving is a silent
no-op like every other passive save, so write to `db.overviewLayout` directly.

## Decisions for the owner

1. **Layout model.** Do you accept "order plus width, height stays automatic"
   (recommended), or do you want free-form placement and fixed heights? The
   second costs about twice as much and makes Tab order and phone layout
   harder.
2. **Scope of the saved layout.** One layout for all your campaigns
   (recommended), or a layout per campaign, or one default with an optional
   per-campaign override.
3. **Hub cards as separate cards.** Do you want each of the four hub cards
   (Prep, Run, World & Lore, Reference) and the two Prep cards (checklist and
   feed) to be separate, movable cards? This is needed for "move each card"
   and is Phase A work (recommended: yes).
4. **Width steps.** Four steps (one third, half, two thirds, full) as
   proposed, or finer (any of 3 to 12 columns)?
5. **Phone.** Reorder and hide only, no resize (recommended), or no edit mode
   on a phone at all, or a separate phone order.
6. **Row heights.** Top-align cards in a row (recommended; a short card leaves
   space under it) or stretch cards to equal height.
7. **Extra cards.** Add the counts strip (the six old tiles) as a hidden-by-default
   card in Phase E? Any other card you want in the tray (quick actions,
   upcoming sessions)?
8. **Reset.** Is a **Reset layout** button in the edit bar plus an Undo toast
   enough, or do you also want a Reset in Preferences?
9. **Merge order.** Do you agree edit mode starts after the other three
   Overview sessions merge (collapse, links-voice, world-first)? Phase A can
   start earlier if you want to see progress, at the cost of re-editing the
   same e2e files.
