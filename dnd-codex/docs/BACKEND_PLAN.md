# D&D Codex — Backend & Accounts Plan

Status: **approved (2026-09-01)** · Stack: **Supabase** · Auth: **OAuth only** · Target: 1 DM + 6 players · Cost at this scale: **$0**

## Goal

Add **user accounts** so people (and their data) exist beyond a single browser, and
so a DM can **share quests/notes directly to a player's account** — the shared item
shows up for the right person automatically, instead of copy‑pasting a share code.

Everything we've built so far stays; this is additive.

## What accounts unlock

- **Profiles** — each person signs in once; a DM's campaigns know who their players are.
- **Real sharing** — "Share with players" delivers to a player's account, not a code.
- **Data follows you** — once campaigns sync to the cloud, switching domain/browser/device
  no longer risks losing anything (this resolves the `*.pages.dev` → custom‑domain worry and
  the browser‑eviction worry entirely).

## Recommended stack: Supabase (backend) + Cloudflare Pages (frontend, unchanged)

Why Supabase for *this*:
- **Auth, Postgres, row‑level security, and realtime out of the box** → the least code to write.
- **Postgres is relational**, so our `campaigns / notes / links` model ports over almost 1:1.
- **Row‑Level Security (RLS)** is the whole ballgame for a sharing app: the *database* enforces
  "a player can read a campaign's shared items only if they're a member," so there's no way to
  leak data through a bug in app code.

Frontend stays exactly where it is (Cloudflare Pages). Supabase is just the data/auth layer.

Alternative: **Cloudflare (D1 + Workers + Access)** keeps everything under the account you just
made and never pauses on the free tier, but I'd hand‑write more of the API. Supabase is the faster
path to working; we can revisit if you'd rather consolidate.

### Cost at 7 users
- Supabase free tier: 500 MB DB, 50k monthly auth users, realtime included → **$0**.
- One caveat: **a free Supabase project pauses after ~7 days of inactivity** (un‑pause = one click).
  For weekly play it's borderline‑fine; $25/mo removes it if it gets annoying. Not needed to start.
- Optional later: custom domain (~$10/yr).

## Core principle: keep local‑first, add the cloud on top

We **keep Dexie/IndexedDB** as the local store, so all the existing `useLiveQuery` UI code is
untouched and the app still works offline. A **sync engine** mirrors Dexie ⇄ Supabase in the
background. This is the key decision that keeps the rework small and preserves offline use.

## Data model (Postgres)

Mirrors the current Dexie schema, plus identity and membership:

- `profiles` — `id` (= auth user), `username`, `display_name`.
- `campaigns` — existing fields + `owner_id`, `updated_at`, `deleted_at` (soft delete for sync).
- `campaign_members` — `(campaign_id, user_id, role)` where role ∈ {dm, player}. This is the
  "profiles linked to campaigns a DM runs" you described.
- `sessions`, `locations`, `npcs`, `items`, `notes`, `links` — existing fields + `updated_at`,
  `deleted_at`.
- `player_notes` — existing fields + `author_id`; **private to the author** (the DM can't read
  a player's personal notes, matching today's design).
- `shares` — `id`, `from_user`, `campaign_id`, `to_user`, `payload` (jsonb: our existing
  SharePacket), `created_at`, `consumed`. This is the "share inbox."

### Security (RLS) sketch
- `profiles`: anyone signed in can read display names; you can edit only your own.
- `campaigns` / content: **DM (owner) has full access; members can read**; players write only
  their own `player_notes`.
- `shares`: a player can read shares **addressed to them**; a DM can create shares only for
  campaigns they own. The DB enforces this — not app code.

## Auth

- **Discord OAuth** (perfect for a D&D group — you probably already share one) **+ email magic link**
  as a fallback. Supabase supports both with a few lines.
- On first sign‑in, create a `profile` row and offer to **push existing local campaigns to the cloud**
  (reuses the export/import we already have).

## Phased roadmap (value‑first, so we stop anytime and still have something useful)

**Phase 0 — Auth foundation** *(small)*
Supabase project, Supabase JS client, Discord + email login, a sign‑in screen, and auth state in the app.

**Phase 1 — Profiles** *(small)*
`profiles` table + auto‑create on signup; a tiny "who am I" display.

**Phase 2 — Cloud Share Inbox → the payoff you asked for** *(medium)*
`shares` table + RLS. "Share with players" now targets a **player's account** instead of a code.
Players get an **"Shared with you"** inbox on their home; one click imports it (reusing today's
SharePacket + importer). **This delivers the exact value — account‑to‑account sharing — without
needing full campaign sync yet.** Good place to prove the group actually uses it.

**Phase 3 — Full campaign cloud sync** *(large)*
Mirror all tables; background sync engine (last‑write‑wins per record via `updated_at`, tombstones
for deletes). Dexie stays the local mirror so the UI is unchanged. **This is what makes your data
follow you across domains/devices and ends the eviction/domain worries for good.**

**Phase 4 — Live shared campaign views + realtime** *(medium)*
`campaign_members` + Supabase Realtime so shared content appears live; optional "who's online."

Recommended order: **0 → 1 → 2**, then decide on **3/4** once you know the group is sticking with it.
Phase 2 alone gives you the "share from a user's perspective" win cheaply.

## Open decisions
- **Stack:** Supabase (recommended) vs. Cloudflare all‑in‑one.
- **Conflict handling:** last‑write‑wins is fine for a small group; anything fancier is overkill.
- **Images:** today they're base64 inside notes. For sync we'd move uploads to Supabase Storage
  (a URL instead of inline bytes) to keep rows small — a Phase 3 sub‑task.
- **Free‑tier pause:** live with the occasional un‑pause, or $25/mo later.

## Immediate next step
Confirm **Supabase vs. Cloudflare**, then I start **Phase 0** (auth + login). It's self‑contained,
free, and doesn't touch any existing data — a safe first slice we can ship and test today.
