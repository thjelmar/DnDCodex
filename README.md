# ⚔️ D&D Codex

A local-first web app for **Dungeons & Dragons** session notes and campaign
building. Everything is stored privately in your browser — no account, no
server, no tracking. Runs entirely as a static site, so it hosts for free on
GitHub Pages.

## Features (v1)

- **Campaigns** — create multiple worlds, give each an accent color and a
  markdown world overview, and cross-link related campaigns.
- **Session notes** — dated sessions with player-facing notes *and* private
  DM-only notes, markdown with live preview, autosave.
- **World-building notes** — a lightweight wiki, organized by category.
- **NPCs** — role, disposition, home location, description, and stat blocks.
- **Locations** — towns, cities, dungeons and more, nested via parent
  locations.
- **Items** — a sortable, filterable item table with rarity, attunement, and
  value.
- **Cross-linking** — connect any NPC / location / item / note / session to any
  other with a labeled relationship (e.g. "ally of", "located in"). Also
  supports `[[wiki links]]` inside any markdown field.
- **Backup & data** — one-click JSON export/import, plus `.ics` calendar export
  of all session dates for Google/Apple/Outlook calendars.

### Planned

- Google Drive sync for cross-device backup.
- Live two-way calendar integration.
- Roll tables for random loot/encounters.

## Tech stack

- **React + TypeScript + Vite** — static SPA.
- **Dexie (IndexedDB)** — fast local persistence with reactive queries.
- **HashRouter** — so deep links work on GitHub Pages without server rewrites.

## Develop

```bash
npm install
npm run dev
```

Then open the printed local URL.

```bash
npm run build      # production build into dist/
npm run preview    # preview the production build
npm run typecheck  # type-check without emitting
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages → Build and deployment**, and set
   **Source** to **GitHub Actions**.
3. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) builds
   and publishes automatically. Your app appears at
   `https://<your-username>.github.io/<repo-name>/`.

The Vite config uses a relative `base` and the app uses hash-based routing, so
it works under any repository sub-path with no extra configuration.

## Data & privacy

All data is stored in your browser's IndexedDB. Clearing site data or switching
browsers/devices will not carry it over — use **Backup & Data → Export** to keep
a JSON copy. You can commit that JSON into a private repo as a durable backup.
