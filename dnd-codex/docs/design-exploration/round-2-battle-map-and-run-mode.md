# Round 2: battle map and Run Mode mockups

Stitch project: "D&D Codex round 2: battle map and Run Mode (demo data only)"
(`projects/17011334611700466990`, private). Design system "D&D Codex Spellbook"
(`assets/13406120784310395037`), built from `stitch-design-language.md`.

The default model timed out on every request, and screens that "timed out"
still appeared in the project several minutes later. All three screens used
`GEMINI_3_5_FLASH_LITE`. Check `list_screens` a few minutes after a timeout
before retrying.

| File | Stitch screen | Status |
| --- | --- | --- |
| `round-2/battle-map-v1.png` | Battle Map, The Gilded Stag (first draft) | Superseded. Two stacked top bars, invented AC and level labels. |
| `round-2/battle-map-revised.png` | Battle Map Editor, The Gilded Stag (revision) | Best battle map direction so far. |
| `round-2/run-mode.png` | DM Run Mode, Battle Map and Encounter Tracker | Good direction, needs content and layout fixes. |
| `round-2/run-mode-revised.png` | Same screen after a second edit pass (Stitch screen `b0b83104366641feb11a98e79479cdac`) | Initiative rows fixed. Banner, title card, left rail and badges not fixed. |

## Battle map (revised)

Problems in the live page: the header, map selector, name field, six text
buttons and a tip paragraph use about 170px before the map starts, the tools
have no grouping or active state, and the right panel is a stack of small boxes.

What the revision gets right:

- One 48px top bar: breadcrumb, map switcher, Edit and Preview as player toggle,
  Full screen, Run session, overflow menu.
- A vertical tool rail with grouped icons (Select, Measure | Fog, Templates |
  Add token, Add object) and a clear active tool.
- A floating bar on the selected token (Duplicate, Condition, Delete).
- A tabbed inspector (Tokens, Grid, Map) with Heroes, Foes and Objects, an HP
  pill and an eye toggle per row. This matches what the app already stores.
- An initiative chip strip bottom-left, zoom controls bottom-right, and a hint
  chip.

Still to fix:

- The map name appears twice in the top bar (switcher and plain text). Keep one,
  editable.
- The sidebar shows Encounters, Monsters and Spells, which do not exist. Use
  the real campaign nav (see the page tree in the app).
- The map sits in a bordered box with dead space around it. It should fill the
  area and pan and zoom within it.
- Tool names need tooltips, and Fog and Templates need an options flyout.

## Run Mode

What it gets right:

- The map is the main area, with a tool strip (Select, Ruler, Fog, AoE
  Template) above it and a Round banner with the current turn.
- The right column has Combat, Notes, Dice Log and Handouts tabs. Combat is an
  initiative list with HP bars, condition chips, and Damage, Heal and Condition
  actions on the current row. This is a clear upgrade over the live Combat card.
- A bottom dice rack with a custom roll field, Dis/Norm/Adv, Public toggle and
  a last-roll result chip. Tokens carry HP rings and condition badges, and the
  current-turn token has an accent glow.

Still to fix:

- The Round banner and the right column cut off the map; the banner text is
  clipped ("Sable" at the edge).
- The map title card is a narrow column that wraps one word per line.
- Invented 5e content the app does not have: AC, Spell DC, Speed, "Deadly
  encounter", class labels, a "Party Vitals" and "Atmosphere" nav, "Quick Ref".
  Keep only data the app stores (name, initiative, HP, conditions).
- The left rail replaces the app's "In play" pins with a generic tool list. Keep
  the In play pins, collapsed to a slim rail.

## Second pass results (2026-11-23)

- **Run Mode:** the initiative rows are now clean (initiative, name, HP bar,
  condition chips; Sable, Mordrek, Thug 1 and Thug 2 keep Active, Prone and
  Bloodied tags). The edit did not fix the clipped Round banner, the wrapping map
  title card, the "Codex tools" left list, the Deadly encounter badge, Quick
  Ref, or the DC target and Spell DC. The clipped banner and title look like
  layout bugs in Stitch's generated HTML, so treat them as "do not copy", not
  as design intent. Build these parts from the written brief above.
- **Battle map:** Stitch reported applying the edit (one map name, the real nav,
  an edge-to-edge canvas, a Fog tooltip and flyout) as changes to the screen's
  HTML, but the screenshot and the HTML file had not refreshed when checked, so
  the result is unverified. Open screen `cfe75300df6447b7b476e23cfe9c4e70` in
  Stitch to see it.
- The lighter model follows structural edits well and visual layout edits
  poorly. Further polish is cheaper as written requirements in this doc.

## Owner feedback (2026-11-23)

- **Direction:** the first battle map draft (`battle-map-v1.png`, the one with the
  two stacked bars) is closest to what the owner wants for the new page.
- **One of each button.** The draft shows "Run session", "Edit" and "Preview as
  player" twice because it has two stacked top bars. That was a Stitch defect,
  not intent. The built page has exactly one top bar and one of every control.
- **Scene inspector pop-out.** The DM can pop the scene inspector out of its
  dock so the battle map is easier to see. In full screen, the inspector stays
  one key press or one button away (an overlay drawer that opens on demand and
  closes on Escape), not gone.
- **Run Mode.** Keep the initiative order layout and the session run-time timer
  in the top bar. The screen is too crowded: show fewer things at once (tabs and
  collapsible rails, one primary panel at a time).

- **Inspector in its own window (added after the first mockup).** The DM can
  open the inspector in a separate window and move it off the page, for example
  to a second monitor. The inspector menu offers three modes: docked, **Float**
  (over the map) and **Window**. Limits to tell the user:
  - Chrome and Edge 116 or later can open it as a Document Picture-in-Picture
    window, which stays on top of other windows. The page needs a user click to
    open it.
  - Safari and Firefox get a normal popup. A browser cannot keep a normal popup
    on top, so it can hide behind other windows. The page shows this limit in a
    note when it opens the window.
  - The browser can block the popup. Show a message that asks the user to allow
    pop-ups.
  - Build note: the app is local-first, so both windows read and write the same
    IndexedDB database. Render the inspector in the second window from the same
    store (live queries) and do not copy state by hand. Closing the window
    docks the inspector again.
  - Not tested in a real second window yet, only the code path that opens it.

- **Turn pulse and Round pill.** The current turn's token pulses on the map and
  in the lineup. Use one calm halo animation (1.8 seconds, no movement) driven by
  the `--accent` token, and replace it with a static ring when the user prefers
  reduced motion. Build Stitch's "Round X" into the turn order strip at the bottom left
  (owner decision, not a separate pill over the map): the strip reads "Round 2",
  the current name, a Next button (key `N`), then the combatant chips. Next advances the pulse and adds
  1 to the round after the last combatant.
- **Inspector header.** Header controls (float, window, close) are icon-only with
  tooltips so they fit in the 300px panel.

Our own HTML mockup of the battle map with these changes is
`round-2/battle-map-mockup.html`. Open it in a browser. It uses the app's real
color tokens and demo data only.

## Next

Owner picks what to keep, then a worker session builds the battle map first
(layout and CSS in `BattleMapPage.tsx` and `styles.css`), then Run Mode, reusing
the same tool rail.
