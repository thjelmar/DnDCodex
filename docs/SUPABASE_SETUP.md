# Supabase Setup Checklist (Phase 0 — Auth)

Do these once. When you're done, you'll have a **Project URL** and **anon key** to drop in,
and Discord + Google sign-in enabled. The app code is already wired for it.

> Placeholder used below: `<REF>` = your project ref (the part before `.supabase.co`).

## 1. Create the Supabase project
1. https://supabase.com → **New project**.
2. Name it (e.g. `dnd-codex`), pick a **region near you**, set a DB password (save it somewhere).
3. Wait ~2 min for it to provision.
4. **Settings → API** → copy two values:
   - **Project URL** → `https://<REF>.supabase.co`
   - **anon public** key (this one is safe in the browser)

## 2. Set the auth URLs (so OAuth redirects back to your app)
**Authentication → URL Configuration:**
- **Site URL:** your live app URL (e.g. `https://dnd-codex.pages.dev`)
- **Redirect URLs** — add all you use:
  - `http://localhost:5173` (local dev)
  - `https://dnd-codex.pages.dev` (your Cloudflare site)
  - (later) your custom domain

## 3. Enable Discord
1. https://discord.com/developers/applications → **New Application**.
2. **OAuth2** → copy **Client ID** and **Client Secret**.
3. Under **OAuth2 → Redirects**, add: `https://<REF>.supabase.co/auth/v1/callback`
4. In Supabase → **Authentication → Providers → Discord** → toggle on, paste **Client ID** + **Secret**, save.

## 4. Enable Google
1. https://console.cloud.google.com → create/select a project.
2. **APIs & Services → OAuth consent screen** → configure (External; app name; your email). Add yourself as a test user if it asks.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
4. **Authorized redirect URIs**, add: `https://<REF>.supabase.co/auth/v1/callback`
5. Copy **Client ID** + **Client Secret**.
6. In Supabase → **Authentication → Providers → Google** → toggle on, paste them, save.

## 5. Give the app the keys
Two places need `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`:

**Local dev** (so we can test here):
```
cp .env.example .env
# then edit .env with your Project URL + anon key
```

**Cloudflare Pages** (so the live site works):
- Pages project → **Settings → Environment variables** → add both vars (Production, and Preview if you want) → **redeploy**.

## Done?
Once `.env` is filled in (or you paste me the URL + anon key — the anon key is publishable, not a secret),
I'll restart the dev server and we'll verify a real Discord/Google sign-in end to end. Then on to
**Phase 1 (profiles)**.

---

# Migrations (SQL Editor)

Run each file in `supabase/migrations/` once, in order, via **Supabase → SQL Editor → New query → Run**.
The "destructive operation" banner is just the `drop policy if exists` / `drop trigger if exists`
guards — safe to run. Re-running any file is idempotent.

| File | What it adds |
|------|--------------|
| `0001_profiles.sql` | `profiles` table + auto-create trigger |
| `0002_membership.sql` | cloud `campaigns` + `campaign_members` + `join_campaign()` |
| `0003_shares.sql` | `shares` inbox table |
| `0004_realtime.sql` | live updates for `shares` |
| `0005_records.sql` | **Phase 3:** the `records` sync mirror + live updates |

# Phase 3 — full campaign sync

After running `0005_records.sql`, every campaign you own is mirrored to the cloud and follows your
account across devices. Nothing else to configure — sign in and it just works.

**How it works (plain version):**
- Your browser (IndexedDB) stays the source of truth. The cloud `records` table is a JSONB mirror —
  one row per entity (session, NPC, note, …), stamped with a server time.
- On sign-in the app pulls down every campaign your account owns (creating any that aren't on this
  device yet) and backs up any local campaigns that weren't in the cloud.
- Edits push automatically ~1s after you make them; other devices get them live (Realtime) or within
  a minute. Conflicts resolve last-write-wins per record.
- Players still only receive **shares** (curated quests/notes) — the `records` mirror is **owner-only**
  (Row-Level Security), so nobody sees your full notebook.

**Test it end to end:**
1. Sign in on this browser. The sidebar (under your name) should show **“☁️ Synced N campaigns • just now.”**
2. In Supabase → **Table editor → records**, confirm rows appear (kind = campaign/session/npc/…).
3. Open the app in a **different browser or a private window**, sign in with the **same account** →
   your campaigns and all their contents appear, no import needed.
4. Edit something in one window; within a second or two it shows up in the other.

**Known limitation:** deleting a whole campaign is **not** auto-propagated to your other devices (a
delete on one device may be undone by another re-uploading it). This is deliberate — silently deleting
across devices on a stale/empty cloud read is too risky. Records (sessions, NPCs, notes, links) *do*
delete everywhere. Full campaign-delete propagation is a later refinement.
