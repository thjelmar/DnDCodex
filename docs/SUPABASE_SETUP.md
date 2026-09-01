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
