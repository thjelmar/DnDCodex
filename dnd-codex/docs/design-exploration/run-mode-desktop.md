# Run Mode, desktop and tablet redesign (T-98)

Status: design for the owner's approval. No app code yet.
Mockup: [`round-2/run-mode-mockup.html`](round-2/run-mode-mockup.html). Open it in a
browser. It has a Desktop and a Tablet switch, uses the app's real color tokens, and uses
demo data only ("The Hollow Crown", "Session 3 — The Sunken Vault", "The Gilded Stag — Brawl").

I did not use Stitch for this. The owner already chose the structure from Stitch's
Run Mode draft (initiative layout, run-time timer), and the notes in
`round-2-battle-map-and-run-mode.md` record that the lighter model follows structural
edits well and layout edits poorly. A hand-built mockup that reuses the battle map
mockup's patterns is faster to review and cannot invent 5e content.

## Audit of the current page

Measured in the demo at `#/run/demo-campaign-0001`, Battle Map tab, with the app sidebar
open (220px) and the demo banner showing (40px).

### 1440 x 900

| Observation | Number |
| --- | --- |
| Map width | 596px of 1440px (41% of the window) |
| Map top edge | y = 312px. The map is 650px tall, so it ends at y = 962px, below the fold. |
| Space above the map | Page header (47px), Notes/Battle Map switch, a map picker, a map name field, a tool row and a tip paragraph. About 200px of controls before the map starts. |
| Columns | In play 200px, center 604px, right column 340px |
| Right column | Combat, Handouts and Dice stacked: 871px of content in a 798px column, so it scrolls |
| In play column | A 200px-wide column that is mostly empty text ("Nothing yet…") until something is pinned |

What is crowded or wasteful:

1. **The map is not the hero.** It is the smallest of the three zones that matter and it
   scrolls out of view. The DM at the table looks at the map and the initiative order
   most, and the layout gives them the least room.
2. **Four stacked bars above the map.** Page header, tab switch, map name and tool row
   each use a full-width strip. The battle map page already solved this with one 48px top bar.
3. **Everything is on screen all the time.** Combat, Handouts and Dice are always
   visible, even though the DM uses Handouts a few times per session. This is the
   "too crowded" the owner described.
4. **The Combat card duplicates the studio's turn strip.** Run Mode's tracker has its own
   Round label, Next and Previous buttons, while the map has the turn strip with a Round
   counter and Next. The DM has two Next buttons.
5. **Emoji icons** (🧑 📍 ⚔️ 📄 📝 🗺️) break the round 2 rule: line icons only.
6. **No timer** for how long the session has run.
7. **No link between a row and a token.** Selecting a combatant does not find its token.

### 1024 x 768 (tablet landscape)

The page switches to one column at 1050px or narrower, and the desktop media query
`(max-width: 820px)` does not match, so a tablet gets neither the phone studio nor a
desktop layout.

- The page is 1630px tall. In play is first, then the map (starting at y = 477px),
  then Combat at y = 1023px, below the map.
- To run combat the DM scrolls past the whole map, and cannot see the map and the
  initiative order together. This is the worst case, and it is the iPad at the table.

## Design

### Principle

One hero (the map), one panel (everything else), and every control appears once. Anything
the DM needs now is on screen. Everything else is one key press away and closes on
Escape.

### Layout

```
+--------------------------------------------------------------------------+
| <  The Hollow Crown   [Session 3 — The Sunken Vault v]  [Map v]  (o 02:44:18 ||)   Live [End session]  [full] [panel] |  48px
+----+--------------------------------------------------+-----------------+
| V  |                                                  | Combat Notes .. |
| M  |                      MAP                         |                 |
| -  |                                      [- 100% +]  |  initiative     |
| F  |                                                  |  list           |
| T  |                                                  |                 |
| .  |  Round 2 [Next] (S)(M)(V)(T)(B)(P)               |  [Add] [...]    |
| In |                                                  |                 |
| play+--------------------------------------------------+-----------------+
|    | d4 d6 d8 d10 d12 d20 d100  [1d20+5][Roll] Dis Norm Adv    last: 19  v |  48px, collapses
+----+--------------------------------------------------------------------+
  48px                      fills                                 360px
```

With the app sidebar hidden at 1440 x 900, the map gets 1032 x 756px: about twice the area
of today's 596 x 650px map, and all of it is above the fold. With the dice bar collapsed
it gets 1032 x 804px.

#### Top bar (48px, one of every control)

Left to right:

1. **Exit run mode** (icon button, back arrow, tooltip "Exit run mode").
2. **Campaign name** with its color dot. Plain text, not a heading card.
3. **Session switcher.** The dropdown replaces the select and the "New session" button;
   "New session" becomes the last item in the dropdown. This is the one Run session switcher.
4. **Map switcher.** The same menu the studio top bar uses (`BmMenu`). "New map" is the last item.
5. **Run-time timer** (see below).
6. Spacer.
7. **Live control.** The existing `LiveSessionControl`, unchanged in behavior: "Start live
   session", or a Live badge and "End session". Join voice (`JoinVoiceButton`) stays beside
   it and shows only when the campaign has a voice channel.
8. **Full screen** and **Run panel** (show or hide, key `I`) icon buttons.

The studio's own Edit and Preview toggle, breadcrumb and map name field do not appear in Run
Mode. Editing the map is a Run Mode non-goal: the DM changes a map from the Battle Map page.
A single "Edit map" item in the map switcher menu links there.

#### Map region

The studio's canvas, tool rail, zoom controls and turn strip, unchanged. The tool rail
gains one item at the bottom: **In play**, which opens the left flyout.

- **Turn strip (bottom left of the map).** It stays the only Round counter and the only
  Next button. The Combat tab does not repeat them (see "One of each").
- **Turn pulse.** The current token pulses on the map, in the strip and on its row in the
  Combat tab, with the same 1.8-second `--accent` halo and a static ring under reduced motion.
- **Zoom controls** move to the top right so the bottom edge is free for the strip.

#### Left rail: In play (collapsible)

The 200px In play column becomes a 48px rail item with a count badge. It opens a 260px
flyout over the map (key `[`). The flyout holds the pin search box and the grouped list
the page has today (NPCs, Locations, Items, Notes), with Add to combat and Pin buttons.
It closes on Escape or when you click the map. It never shrinks the map.

#### Right panel: one panel, five tabs

The panel is the studio's `Inspector` shell with Run Mode's sections as tabs. The phone
path already does this with `runKit`. The tabs show an icon, and the active tab also shows
its label:

| Tab | Contents | Notes |
| --- | --- | --- |
| **Combat** | Initiative list, Add combatant, overflow menu (Roll all, Sort, End combat), Full tracker link | Default tab |
| **Notes** | DM notes, then Session notes, as today (`RunSessionNotes`) | A **Widen** button makes the panel 640px for comfortable writing |
| **Handouts** | `RunHandouts`: list with Show, and **Upload and show** | |
| **Dice** | The full roller (`DicePanel`): count, modifier, Dis/Normal/Adv, dice, formula, log | The quick bar hides while this tab is open |
| **Scene** | The studio's Tokens, Grid and Map sub-tabs | Today's three studio tabs fold into one so the panel has five tabs, not seven |

Panel behavior, all inherited from the inspector:

- Hide and show (`I`). The map reflows. The state is remembered per campaign.
- **Float** over the map, **Window** in its own browser window (Document
  Picture-in-Picture in Chrome and Edge 116 or later, a normal popup in Safari and Firefox),
  and **Drawer** (the on-demand overlay used in full screen and on tablets). The same limits
  and messages as the inspector apply (see `round-2-battle-map-and-run-mode.md`).
- Both windows read and write the same IndexedDB and `localStorage` combat state through
  live queries, so a second monitor shows the same initiative order without copying state.

#### Initiative list (Combat tab)

The layout the owner liked, trimmed to what the app stores. One row per turn slot, in order:

- **Portrait.** The token's image or initials on its side color (heroes green, foes red). A
  group shows stacked avatars with no label, as in the turn strip.
- **Name and initiative number.** The number is right aligned, in the serif face.
- **HP bar** with `hp / max`. Green above 60%, amber to 25%, red below.
- **Condition chips.** Only the conditions the combatant has.
- **Current row** is highlighted with the accent border and the pulse. Only the current row
  shows **Damage**, **Heal** and **Condition** with one amount field. The amount applies to the
  current combatant. For a group, the quick actions target the first living member and the row
  lists each member's HP (the per-monster edit the group box already supports).
- **Groups are one slot.** "Thugs × 2" shows the combined `hp / max` and drops a member
  when it reaches 0 HP, as the studio already does.

Selecting a row selects its token and pans the map toward it (a gentle pan, capped, so the
map never jumps). Clicking a token or a chip in the turn strip selects the row and scrolls it
into view. Selection is visual only: it never changes the turn. The token and row are linked
by `token.combatantId`, which the studio already stores.

What is not on screen: AC, Spell DC, Speed, "Deadly encounter", class labels, Quick Ref and
Party Vitals. The app does not store them, so the design does not show them.

#### Bottom dice bar (collapsible)

A 48px quick row under the map: d4 to d100, a formula field with **Roll**, one
Dis/Norm/Adv control, and the last result. A chevron collapses it to nothing; a small
**Dice** chip at the map's bottom right brings it back (key `D`). It reuses the same
`rollDice` and roll log as the Dice tab. It is the quick home. The Dice tab is the full home,
and the bar hides while the tab is open, so the DM never sees two sets of dice.

### One of each

| Control | Where it lives | Not repeated in |
| --- | --- | --- |
| Next turn, Round | Turn strip | Combat tab (the tab shows no Round or Next) |
| Start combat | Turn strip (it shows **Start combat** before combat starts) | Combat tab |
| Roll all, Sort, End combat | Combat tab overflow menu | |
| Add combatant | Combat tab footer | In play flyout keeps only "Add to combat" per NPC, which adds that NPC |
| Run session (live) | Top bar | |
| Dice | Bar (quick) or Dice tab (full) | Never both visible |
| Map switch | Top bar | The studio's name field (hidden in Run Mode) |

### Run-time timer

The pill reads `hh:mm:ss`, with a small accent dot and a pause or resume button. It
counts how long this Run Mode session has been running.

- **Storage.** `localStorage` key `codex.runTimer.<sessionId>`, local-only, never synced, not
  in the JSON backup, so the demo never touches Supabase. Shape: `{ ms, since, seen }`.
  `ms` is the time banked, `since` is the timestamp the current run started (or `null` when
  paused), `seen` is the last heartbeat. Elapsed is `ms + (now - since)`.
- **Reload.** It keeps counting because `since` is stored.
- **Start.** It starts the first time the DM opens Run Mode for that session, and keeps its
  value across visits.
- **Pause.** The DM pauses it with the button. It also pauses when the DM leaves Run Mode
  (the route unmounts), and the heartbeat (every 30 seconds) covers a closed tab or a crash:
  if the page loads and `seen` is more than 5 minutes old, the timer banks time up to `seen`
  and starts paused. It does not pause when the tab loses focus, because the DM is often
  running the table on a different monitor.
- **Reset.** A menu on the pill offers **Reset**, with a confirmation, because it discards the
  banked time.
- **Why not the session record.** The session row syncs to Supabase and to players. The
  timer is private to the DM's device. If the owner wants it to follow them across devices,
  it needs a migration and a decision about who may read it (see the questions).

### Session notes

Notes leave the center and become the **Notes** tab, widened on demand. This removes the
competing column and the Notes/Battle Map switch. Wiki links in the notes still peek (the
existing `SidePanel`) and still update In play. The editors, autosave and "Edit details" link
do not change.

## Sharing code with the battle map studio

Today the desktop path renders `SceneEditor` in `compact` classic mode, and the phone path
renders it with `studio: true` and a `runKit`. The redesign moves desktop and tablets to the
phone's path, so there is one Run Mode studio instead of two.

| Concern | Reuse | New |
| --- | --- | --- |
| Map, tool rail, zoom, turn strip, pulse, groups | `SceneEditor` with `studio: true` | none |
| Panel shell, tabs, float, window, drawer | `Inspector`, `useInspectorWindow`, `runKit.tabs` | Run tabs list, five tabs (Scene folds three) |
| Top bar | The studio's `bm-top` frame | `runKit.topBar` slot that replaces the crumb, name field and Edit/Preview with the Run Mode bar |
| Initiative list | `CombatantRow` logic, `turnSlots`, `groupKey`, `groupTurn`, `useCombat` | `InitiativeList` component in `src/components/`, used by the Combat tab only |
| Dice | `DicePanel`, `rollDice` | `DiceBar` quick row |
| Timer | none | `RunTimer` component and `useRunTimer` hook in `src/lib/` |
| Select and center | Token `combatantId` | A controlled `selection` and a `centerOn(tokenId)` on the studio |
| Notes, Handouts, In play | `RunSessionNotes`, `RunHandouts`, `inPlayEl` | none (they become tab bodies) |

To keep the two screens from drifting, shared things stay shared: the toolbar button
classes (`bm-btn`, `bm-seg`), the icon set (`BmIcon`) and the turn strip. Run Mode
adds nothing to `styles.css` that the studio already defines, and adds new rules under a
`.run-studio` scope.

## Tablet and phone

| Width | Behavior |
| --- | --- |
| 1280px and wider | Panel docked at 360px, dice bar on |
| 1051 to 1279px | Panel docked at 320px |
| 821 to 1050px (tablets, iPad landscape 1024 x 768) | The panel is a drawer over the map (button or `I`), closed by default. The map uses the full width. The turn strip, tool rail and dice bar stay. The top bar shows icons only for the map switcher. |
| 820px and narrower, or a short touch screen | The existing phone path, unchanged: full-screen map with a tabbed drawer (`runKit` tabs). The phone keeps its tabs (Combat, In play, Notes, Handouts, Dice) and the Scene tab stays three tabs there until the owner says otherwise. |

The mockup's Tablet switch shows the 1024 x 768 layout with the panel closed. On a tablet the
panel is a drawer, not docked, because 360px of a 1024px screen is a third of the map.

## Build phases (after approval)

1. **Layout and tabs.** Route switches to `studio: true` plus `runKit` on desktop; the Run
   top bar; the Combat, Notes, Handouts, Dice and Scene tabs; the In play flyout; the dice bar.
   Remove the three-column grid and the emoji icons.
2. **Initiative list and selection.** `InitiativeList`, row and token selection, pan to token,
   quick actions on the current row.
3. **Timer.** `RunTimer`, `useRunTimer`, pause, reset, heartbeat.
4. **Pop-out and polish.** Float and Window for the panel, widen, remembered state per campaign,
   tablet drawer, reduced motion, full screen.

Each phase ships with Chromium and WebKit e2e tests and the existing checks. Behavior to keep
working: notes autosave, pins, combat, handouts and Upload and show, dice, the voice roster
if present, and the live battle map.

## Open questions for the owner

1. **App sidebar in Run Mode.** The mockup shows no app sidebar, so the map gets the width.
   Do you want Run Mode to hide the app sidebar (Exit run mode brings it back), or keep it
   with its collapse button?
2. **Timer.** Is a local-only timer that starts the first time you open Run Mode for a
   session, and pauses when you leave, what you want? Or should it start only when you press
   **Start live session**, or sync across your devices?
3. **Notes.** Notes as a tab with a **Widen** button, or a drawer that slides over the map
   (like the In play flyout)?
4. **Dice.** One quick bar plus a Dice tab (the bar hides while the tab is open) works, or
   would you rather have only the bar and drop the Dice tab?
5. **Scene tab.** Is folding Tokens, Grid and Map into one Scene tab acceptable on desktop,
   given that the DM edits the map from the Battle Map page?
6. **Tablet.** Should a tablet in portrait use the phone layout (full-screen map and tabbed
   drawer)? The mockup assumes yes below 821px.
7. **Selecting a row.** Should selecting a row also pan and zoom to the token, or only pan
   (the mockup pans a little and never changes zoom)?
