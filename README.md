# ⚔️ D&D Codex

A local-first web app for **Dungeons & Dragons** session notes and campaign
building. Everything is stored privately in your browser by default — no account
required, no tracking. Sign in (optional) to sync your campaigns across devices
and share with your group. Runs as a static site, hosted on **Cloudflare Pages**.

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
- **Roll tables** — weighted random tables for loot, encounters, and rumors.
- **Backup & data** — one-click JSON export/import, plus `.ics` calendar export
  of all session dates for Google/Apple/Outlook calendars.
- **Accounts & cloud sync** *(optional)* — sign in with Discord or Google to sync
  every campaign you own across devices and share quests/notes with your players,
  live. Backed by Supabase; the app still works fully offline without it.

### Planned

- Live two-way calendar integration.
- A global "new share" indicator across joined campaigns.

## Tech stack

- **React + TypeScript + Vite** — static SPA.
- **Dexie (IndexedDB)** — fast local persistence with reactive queries.
- **HashRouter** — so deep links resolve on any static host without server
  rewrites.
- **Supabase** *(optional backend)* — OAuth auth, Postgres + Row-Level Security,
  and Realtime for cross-device sync and sharing.

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

## Deploy (Cloudflare Pages)

The live app is hosted on **Cloudflare Pages** at
[dndcodex.pages.dev](https://dndcodex.pages.dev), auto-deployed on every push to
`main`. To stand up your own:

1. Push this repo to GitHub.
2. In Cloudflare → **Workers & Pages → Create → Pages → Connect to Git**, pick
   the repo.
3. Build settings: **Build command** `npm run build`, **Output directory** `dist`
   (framework preset: Vite). Add `NODE_VERSION=20` under **Variables and secrets**.
4. For the optional backend, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   as build variables (see [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)). Omit
   them and the app runs purely local-first.

The Vite config uses a relative `base` and hash-based routing, so it works from a
domain root or any sub-path with no extra configuration.

## Data & privacy

Data is stored in your browser's IndexedDB. **Signed out**, it never leaves the
browser — clearing site data or switching devices won't carry it over, so use
**Backup & Data → Export** to keep a portable JSON copy. **Signed in**, campaigns
you own also sync to your account (Supabase) so they follow you across devices;
the `records` mirror is protected by owner-only Row-Level Security, and players
only ever receive the specific quests/notes a DM shares with them.
