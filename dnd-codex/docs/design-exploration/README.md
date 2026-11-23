# Design explorations

Written by worker sessions during the November 2026 Overview redesign. They record
why the features look the way they do. Nothing here is code, and the app does not read
these files.

| Document | What it covers | Built as |
| --- | --- | --- |
| `stitch-layout-exploration.md` | The first Stitch layout exploration: what was wrong with the old Overview and the three directions (command centre, sidebar-first, hub). | The sidebar page tree and hub cards (T-68 to T-75). |
| `stitch-design-language.md` | The visual language extracted from `styles.css` for Stitch (colors, type, spacing). | Reference only. |
| `campaign-home-gap-analysis.md` | A second Stitch mockup compared with the live Overview, element by element, with a recommended subset. | The hub cards, their images, and the prep checklist. |
| `overview-edit-mode.md` | The design for editing the Overview layout: card registry, widths, saving, keyboard use, phases A to E. | Phases A to C shipped (T-87 to T-89). Phases D and E are open (T-90, T-91). |
| `battle-map-library.md` | The shared battle map library: who can publish, storage, copying into a campaign, the database design, phases. | Phases 1 and 2 shipped (T-76, T-77). Phase 3 is open (T-78). |
| `supabase-memory.md` | An investigation of Supabase memory pressure, a read-only diagnostics pack, and a fix plan. | Findings only. The live database is about 34 MB on Nano compute, so the code tickets (T-79 to T-83) stay low priority. |
| `world-map-detail-maps.md` | Pins that open a detail map (such as a town) with a zoom and a Close button: data model, zoom, player share, migration 0044. | Built as T-94. |

The Stitch mockup images and HTML that the exploration produced were not saved here.
They live in the Stitch project "D&D Codex layout exploration (demo data only)".
Paths in these documents that point to `concepts/` or `baseline/` no longer exist.
