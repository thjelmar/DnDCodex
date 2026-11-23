# Round 2: which pages need a UI overhaul

Reviewed on 2026-11-23 in the demo at `localhost:5173` (1440 by 900 viewport, `main` at `8b73163`). The Daily Duel is hidden in the demo, so it was judged from the code and from round 1 notes (it was reworked in T-65 and T-67).

## Ranking

| Rank | Page | Need | Why |
| --- | --- | --- | --- |
| 1 | Battle map (`/campaign/:id/battlemap`) | High | The page header, map selector, name field, six toolbar buttons and a tip paragraph use about 170px before the map starts, and the map is cropped at the fold. The right panel (Grid, Tokens, and more) is a long stack of small boxes. Tools (Fog, Measure, Templates) are text buttons with no grouping or active state. It is the largest page (1,420 lines) and the one with the most at-the-table value. |
| 2 | Run Mode (`/run/:id`) | High | Three columns where the map tab is small, the "In play" rail is empty by default, and Combat, Handouts and Dice are stacked cards. Combat is not connected to the map view. The map and the initiative order should be one surface. |
| 3 | NPCs and Locations (list and detail) | Medium | A narrow list plus a long form: portrait, name, role, race, disposition and more, then the notes, then the stat block. It reads as a form, not a character sheet. Locations has the same shape and an empty state that wastes the right half. |
| 4 | Sessions | Medium | A list plus a rich editor. Works, but the recap, encounters and loot are plain headings and the metadata sits in a thin row. |
| 5 | Timeline | Medium | The vertical spine is a good idea but it uses a narrow column, tiny type and a bare plot-thread panel. Low effort, good visual return. |
| 6 | World Map | Low to medium | Works well. The side panel and the pin list could match the battle map's new tool rail, so the two map pages feel related. |
| 7 | Items, Tables, Notes, Thought Map | Low | Items is a clean table. Tables is a list plus editor. The Thought Map is sparse but is a specialty view. |
| 8 | Daily Duel | Low | Recently rebuilt (T-65, T-67). Leave it. |

## Recommendation

1. Battle map first. It is the biggest layout problem and sets the pattern (tool rail, collapsible side panels, a map that fills the viewport).
2. Run Mode second, because it should reuse the battle map's tool rail and docked panels.
3. NPCs and Locations third, as a shared "entity page" pattern (hero portrait, tabs for Details, Stat block, Connections).

The design language is unchanged from round 1 (`stitch-design-language.md`): midnight violet surfaces, hairline borders, serif headings, one accent that comes from `--accent`.
