# Battle map library: design

Status: Phase 1 (design only). Nothing is built, committed, or applied.
Draft SQL: [`0042_battle_map_library.draft.sql`](0042_battle_map_library.draft.sql).
Date: November 20, 2026. Base: `origin/dev` at `7b0e9e8`.

## Summary

The owner publishes battle maps to a public library. Any user, signed in or not, browses the
library and presses **Use in campaign**. The app copies the template into the campaign as a
normal local scene plus a local image, so the session runs offline and never depends on the
library again.

The recommendation, in one paragraph: a public Storage bucket for images, one catalogue table
with public read of published rows, publisher rights held in a one-row allowlist table, a
**Publish to library** action on the battle map for publishers only, and a browse page under
**Tools → Battle map library** with a shortcut from the battle map page. Phase 1 ships maps with
grid settings and metadata only. Tokens, fog, and notes stay out until the owner asks for them.

## Goals, non-goals, anti-goals

Goals:

- The owner uploads and manages maps without a deploy.
- A user finds a map and has a playable scene in two taps.
- A copied map survives the template changing or vanishing.

Non-goals:

- Letting other users publish (the schema allows it later; the UI doesn't).
- Ratings, comments, download counters, or an in-app map editor.
- Syncing library items through `user_records` (the library is shared content, not user data).

Anti-goals (this fails even if it works):

- The demo or any signed-out path writes to Supabase.
- A library outage or removal breaks a campaign that already used the map.
- The Supabase free-tier egress allowance runs out because of map browsing.

## Existing code that shapes the design

- `Scene` (`src/db/types.ts`) holds `imageId`, `width`, `height`, `grid` (`cellPx`, `offsetX`,
  `offsetY`, `show`, `color`), `tokens`, `fog?`, `templates?`. Tokens and fog are stored in grid
  cells, so a template's grid carries them.
- `createScene` and `createImage` (`src/db/repo.ts`) create the local records. `createImage`
  calls `blockDemoWrite()`, so the demo already refuses it.
- `BattleMapPage.uploadMap` shows the exact import sequence to reuse: process the image,
  `createImage`, best-effort `uploadMapImage` to the private `battlemaps` bucket (so the live
  player view works), then set `storagePath`. Phase 2 extracts this into one shared helper.
- `MAP_MAX_DIM` is 6144 pixels per side. `processImageFile` outputs WebP.
- The owner gate today is client-side only: `VITE_OWNER_EMAIL` hides the Tickets link
  (`App.tsx`), and `functions/api/bug-reports.ts` enforces `BUG_ADMIN_EMAIL` on the server.
- Closest precedents: `user_records` (0036) for the account sync channel,
  `shared_world_maps` (0023) and the `battlemaps` bucket policies (0021) for RLS and Storage.
- `supabase` is `null` when the `VITE_SUPABASE_*` variables are missing, which is the case on
  the dev site's Preview build.

## 1. What a template contains

Start with the smallest useful set. Everything below is one catalogue row plus two images.

| Field | Notes |
| --- | --- |
| `title`, `description` | 80 and 600 characters. |
| `tags` | Up to 12 free-text tags, lowercase. Seeded suggestions: `dungeon`, `forest`, `city`, `tavern`, `cave`, `ship`, `outdoor`, `indoor`, `night`. |
| Map image | WebP, at most 6144 pixels per side and 10 MB. |
| Thumbnail | 480 pixels wide WebP, about 30 to 60 KB, made by the publisher's browser. |
| `width`, `height`, `bytes` | Of the map image. |
| `grid` | `cellPx`, `offsetX`, `offsetY`. Taken from the scene the owner already aligned. |
| `cols`, `rows` | Derived: map size in squares, for the size filter. |
| `credit`, `credit_url`, `license_note` | Attribution, shown on the card and copied into the scene. |
| `version`, `status` | `draft`, `published`, `archived`. |

Recommendation on what ships beyond that:

- **Tokens:** no. Tokens reference campaign NPCs and images, which don't exist in the target
  campaign.
- **Fog:** no in Phase 1. Phase 3 can add an optional "starts fully covered" flag, which is
  small because fog is a list of revealed cells (empty list means everything covered).
- **Notes:** no. The description covers the use case. DM-facing text belongs in the user's
  own session notes.
- **Area templates (`Scene.templates`):** no.

The grid shows by default in the copied scene (`show: true`, `color` from the existing
default), because the user can already toggle it.

## 2. Who can publish

Recommendation: a database allowlist, enforced by RLS, with no new server code or secret.

- Table `library_publishers (user_id)`. The owner inserts their own row once, in the SQL
  Editor. There is no insert policy, so nobody can add themselves.
- `is_library_publisher()` is a `security definer` function with no argument. RLS policies on
  `battle_map_templates` and on the `battlemap-library` bucket call it for every write. A
  non-publisher who calls the API directly gets an RLS error.
- The client reads its own row from `library_publishers` to decide whether to show publisher
  UI. This is only a UI hint; the database is the real gate.

Why not copy the `BUG_ADMIN_EMAIL` pattern: that pattern routes writes through a Pages Function
that holds the service-role key and compares an email. It works, but publishing uploads up to
10 MB of image, which suits a direct, RLS-checked Storage upload better than a Function body,
and it avoids a second place to configure an email. The allowlist keys on the account id, not
an email string, so a changed email cannot grant or lose access.

Alternative (2 options): compare `auth.jwt() ->> 'email'` inside the policies. It needs no
table, but it trusts the email claim and makes adding a second publisher a code change. I don't
recommend it.

## 3. Who can read

Recommendation: everyone, including signed-out users, for **published** templates.

- Catalogue: RLS lets `anon` and `authenticated` select rows where `status = 'published'`.
- Images: a **public** bucket, so signed-out reads work and the CDN caches them.
- The library needs `isSupabaseConfigured`. Where it's false (the dev site's Preview build, a
  fresh clone), the page shows a short "The library isn't available in this build" notice and
  nothing else breaks.

Demo mode: the library **never calls Supabase** in the demo. Recommendation: show the browse
page with a bundled sample of 3 small templates (thumbnails and maps as lazy-loaded asset URLs
from `import.meta.glob`, not inlined into the JS bundle). **Use in campaign** in the demo calls
`notifyDemoBlocked()`, like other demo writes. The alternative is hiding the library in the demo,
which is cheaper (no sample art) but hides a feature the demo is meant to show. The data layer
takes a `source` (`remote` or `sample`), chosen once from `isDemo()`, and the `remote` source
is the only file that imports `supabase`. A new e2e test asserts zero requests to the Supabase
host in the demo (extending `demo-isolation.spec.ts`).

## 4. Storage and cost

- **Bucket:** `battlemap-library`, public, `file_size_limit` 10 MB, MIME allowlist (WebP, JPEG,
  PNG). Path: `<templateId>/v<version>/map.webp` and `thumb.webp`. A republish writes a new
  version folder, so URLs are immutable.
- **Cache headers:** upload with `cacheControl: 31536000` (one year). Safe because a path never
  changes content.
- **Thumbnails:** the browse grid loads only thumbnails (`loading="lazy"`, width and height
  set). The full map downloads once, when the user opens the preview at full size or presses
  **Use**.
- **Egress:** Supabase's free plan includes 5 GB of egress per month (confirm on the
  dashboard; plan limits change). A 3 MB map used 500 times is 1.5 GB. Browsing costs about
  50 KB per card. The CDN and one-year caching absorb repeat views. Mitigation if it ever
  matters, in order: lower the WebP quality on publish, then front the bucket with a Pages
  Function using the Cloudflare cache, then move images to Cloudflare R2 (no egress fees). I
  don't recommend building any of these now.
- **Storage:** 1 GB on the free plan. 50 maps at 3 MB plus thumbnails is about 160 MB. The
  existing per-campaign `battlemaps` bucket shares this allowance, so check usage after the
  first batch of uploads.
- **Offline:** after **Use**, the map lives in IndexedDB like any upload, so the session works
  offline. Browsing needs a connection. The page keeps the last catalogue response in
  `localStorage` (a few KB) so an offline user sees a stale list with a "You're offline" note
  rather than an error; images that were never cached show a placeholder.

Public bucket versus signed URLs (2 options): signed URLs hide unpublished maps better but
require a signed-in session (breaks signed-out browsing), add a round trip per image, and
defeat CDN caching. Public with unguessable UUID paths is the better fit. Residual risk: a
draft's URL works if someone learns it; drafts contain nothing secret.

## 5. What happens when a user uses a template

**Use in campaign** (in the preview and on each card) asks which campaign (a picker, defaulting
to the current campaign when opened from the battle map) and then does a local copy:

1. Download `map.webp` (one request, cached).
2. Create a `StoredImage` (`createImage`) and, best effort, upload it to the campaign's private
   `battlemaps` bucket and set `storagePath`, exactly as `uploadMap` does today. This keeps
   **Show to players** working with no new player code.
3. Create a `Scene` (`createScene`) with `imageId`, `width`, `height`, the template's `grid`
   (`show: true`), `tokens: []`, and a new optional field
   `source?: { libraryId, version, credit, creditUrl }`.
4. Open the new scene in the editor.

`source` is a non-indexed optional field, so there is no Dexie version bump and no cloud
migration (scenes sync as JSON in `records`). Older app code ignores it. Its purposes: show the
credit in the editor, and in Phase 3 offer "A newer version of this map is available" (a
copy, never an in-place change).

If the download fails, nothing is created. If the Storage upload fails, the local scene still
works and falls back to the legacy base64 sync, as today's upload does.

Tokens and fog: none come with a template, so the DM places tokens and paints fog as usual.
The live player view is unchanged: the copied scene is an ordinary scene.

Signed-out users can use a template, because it's a local copy and a local campaign needs no
account. They just skip the Storage upload step.

## 6. Owner workflow

Publishing happens on the battle map the owner already built, so the grid, size, and image
are already correct.

- **Publish to library** appears in the scene's actions menu, only for publishers. It opens a
  modal: title (prefilled from the scene name), description, tags, credit, credit link,
  licence note, and a required checkbox: "I own or have permission to share this art."
- On **Publish** (or **Save as draft**), the browser makes the thumbnail, uploads
  `map.webp` and `thumb.webp` to `<id>/v1/`, then inserts the row. Objects upload first, so a
  failure leaves only orphan files, never a row that points at nothing.
- **Edit:** **Tools → Battle map library → Manage** (publishers only) lists drafts, published,
  and archived items with edit-metadata, replace-image, unpublish, archive, and delete.
- **Republish with a new image or grid:** uploads to `v<n+1>/`, updates the row (`version`
  bumps), deletes the old version's objects. Existing user copies are unaffected.
- **Unpublish:** sets `status = 'draft'`. **Delete:** removes the row and objects.
- **Credits and licence:** the `credit` and `license_note` fields travel with the copy. The
  modal reminds the owner to confirm they hold the rights to any third-party art (purchased
  packs often forbid redistribution, even though the map is the owner's work). The library
  page footer states that maps are published by the site owner and links to a takedown contact
  (the existing bug-report form).

Bulk upload of many maps is out of scope for Phase 1; the owner publishes through the modal.
A script that reads a folder is a cheap Phase 3 addition if the backlog is large.

## 7. User interface

Recommendation: **both** places, one component.

- **Home of the library:** a new **Battle map library** page under **Tools** (route
  `/tools/battlemaps`), reachable without a campaign, next to **Templates**. It also appears in
  the demo.
- **From the battle map:** the map list and the empty state get a **Browse library** button that
  opens the same browse UI in a side panel (the existing `SidePanel`), preselecting the current
  campaign. The existing **New** button is unchanged.

Browse UI:

- A responsive card grid: thumbnail, title, size in squares ("30 × 20"), tag chips.
- A search box (title, tags, description, client-side filter over the catalogue, which is
  small), tag chips as filters, and a size filter (small, medium, large by square count).
- Card tap opens a **preview** modal: a larger thumbnail (the full map loads on request through
  **View full size**), the description, credit and licence, and **Use in campaign**.
- Phone: a single column of cards, the preview becomes a full-screen sheet, and **Use in
  campaign** is a sticky bottom button. Touch targets follow the existing 44 px rule.

Catalogue size: one request loads all published rows (a few KB each). If the library grows
past about 300 items, add server-side paging. This is not needed at launch.

## 8. Database design

The full SQL is in [`0042_battle_map_library.draft.sql`](0042_battle_map_library.draft.sql).
It is additive and idempotent, and nothing has been applied.

- `library_publishers (user_id pk → profiles)`: RLS on; select-own only; no write policy.
- `is_library_publisher()`: `security definer`, `search_path` pinned, **revoked from
  `public` and `anon`**, granted to `authenticated` (per the lint note in project memory). It
  takes no argument, so it leaks nothing about other accounts.
- `battle_map_templates`: the fields in section 1, plus check constraints on lengths, sizes,
  and the `credit_url` scheme. RLS: `anon` and `authenticated` select where
  `status = 'published'`; publishers select, insert, update, and delete everything.
  Indexes: `(status, sort_order, published_at desc)` for browse; GIN on `tags`.
  `touch_records_updated_at` stamps `updated_at`.
- Storage: bucket `battlemap-library` (public, 10 MB, MIME allowlist). Write policies for
  publishers only. **No select policy on `storage.objects`**, so the bucket can't be listed
  (public object URLs don't need one).
- Expected new advisor notes: the public bucket may show a "public bucket" info lint, which is
  intentional. `is_library_publisher` stays callable by `authenticated` on purpose, like
  `is_member` and `is_owner`.
- Old code is unaffected: no existing table, column, function, or policy changes.
- Not included on purpose: a usage counter. An anonymous increment function would be
  abusable and needs rate limiting; ask before adding.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Demo or signed-out code touches Supabase | The data layer's `source` switch plus an e2e test counting requests to the Supabase host in the demo. All library fetches check `isDemo()` first. |
| Egress overrun | Thumbnails first, one-year immutable caching, lazy loading, 10 MB cap. Escalation path in section 4. |
| Hotlinking or scraping the public bucket | Accepted: the content is meant to be shared. Watch the Supabase usage page monthly. |
| Draft URL discovery | Unguessable UUID paths; no list permission. |
| Copyright of uploaded art | Required rights checkbox, licence and credit fields, takedown contact. The owner is the only publisher. |
| Owner account compromise | Same exposure as the Tickets admin. The allowlist can be emptied in SQL; deleting a row hides everything instantly. |
| Orphan Storage objects | Upload-then-insert ordering and delete-on-republish. A Phase 3 "orphan sweep" button lists objects with no row. |
| Opening to other publishers later | The schema has `created_by`, `status`, and a policy per action. Moderation would need a `pending` status, per-user quotas, a report button, and image scanning. Out of scope; flagged so nobody enables it casually. |
| Bundle size | The browse UI and the publish modal are lazy-loaded route chunks. The demo sample uses lazy asset URLs (about 3 small WebP files), not inlined data. No new dependency. |
| Preview builds have no Supabase | The page shows an "unavailable in this build" notice. Check the real library locally with `e2e:live`, or on the live site after release. |
| Shared database with live | Additive SQL only. The owner runs it before the PR merges; because the library UI hides itself when the table is missing (query error), an early merge cannot break anything. |

## 10. Phased build plan

Each phase is a reviewable PR against `dev` that merges on its own. Efforts are rough, for one
session each.

| Phase | Scope | SQL for the owner | Effort |
| --- | --- | --- | --- |
| 1. Read path | Migration 0042 (the draft), `lib/battleLibrary.ts` (remote and sample sources, demo-safe), the browse page and preview, **Use in campaign** (shared import helper extracted from `uploadMap`), the `Scene.source` field, the demo sample. Publishers are added by hand in SQL, and the first maps by hand in the Dashboard. | Run `0042` once, then the one-line publisher seed. | 1 to 1.5 days |
| 2. Publish | **Publish to library** modal on the battle map (publishers only), thumbnail generation, upload, and the **Manage** list with edit, unpublish, delete. | None. | 1 day |
| 3. Polish | Credit shown in the editor, "newer version available", optional fog preset, orphan sweep, folder bulk-upload script. | None, unless fog preset adds a column (additive). | 0.5 to 1 day, optional |

Why this order: Phase 1 delivers value on its own if the owner seeds a few maps through the
Supabase Dashboard, and Phase 2 only adds convenience.

### e2e plan

Existing patterns: `npm run e2e` (local, no backend) and `npm run e2e:live` (a local Supabase
stack through colima, with a loopback-only guard in `scripts/e2e-live.mjs` and
`playwright.config.ts`).

- **`npm run e2e` (no backend):**
  - Demo shows the 3-item sample, **Use** triggers the demo-blocked toast, and no request
    leaves for the Supabase host (extends `demo-isolation.spec.ts`).
  - With no Supabase variables, the page shows the "unavailable" notice and the battle map still
    works.
- **`npm run e2e:live` (local stack):** `supabase start` applies `0042` from
  `supabase/migrations/`. A new `battle-library.spec.ts` (skipped without the stack, like
  `sync-repair.spec.ts`):
  1. The service key seeds a publisher, one published template, one draft, and two small images
     into the local bucket.
  2. Signed out: the catalogue shows the published item only; the draft is absent.
  3. A throwaway user presses **Use**: the scene and image appear in IndexedDB with the right
     grid; the scene still renders after the template row is deleted (copy independence).
  4. A throwaway non-publisher cannot insert into `battle_map_templates` or upload to the
     bucket (RLS errors); a seeded publisher can (Phase 2).
  5. Cleanup deletes the users, rows, and objects, as the existing fixtures do.
- Use only generated tiny images in tests, never real campaign content.

Verified in Phase 2 only by running; nothing in this document has been run.

## Approaches considered

1. **Public bucket + catalogue table + RLS allowlist (recommended).** Direct client access, no
   new server code, CDN-cached, works signed out. Trade-off: public URLs are fetchable by
   anyone who has them.
2. **Pages Function API in front of everything** (like `/api/roadmap`). Hides Storage details
   and allows server-side caching, but needs the service-role key in Preview too, adds code to
   maintain, and passes large uploads through a Function.
3. **Bundle maps in the app.** Zero backend, but every map adds to the download and each new
   map needs a deploy. It fails the owner's goal of publishing without shipping code. The
   3-item demo sample is the only bundled content.
4. **Sync library items per user through `user_records`.** Rejected: it copies the shared data
   into every account, and images don't fit a JSON channel.

## Decisions needed from the owner

1. **Scope of a template.** Approve "map, grid, and metadata only" for Phase 1 (no tokens, fog,
   or notes)? Or should a "starts fully covered in fog" option come in Phase 1?
2. **Public reading.** Approve public reading for signed-out visitors through a public bucket?
3. **Demo.** Approve a browse-only bundled sample of 3 maps in the demo? If yes, which 3 maps
   (and are you sure you can redistribute that art)? Or hide the library in the demo.
4. **Where the library lives.** Approve both **Tools → Battle map library** and a
   **Browse library** button on the battle map page?
5. **Publisher account.** Which account is the publisher (the Google account you sign in with
   on the live site)? I need its email to write the seed SQL, which you run once.
6. **Art rights.** Confirm you hold the rights to share the maps you plan to publish, and say
   whether any use third-party art that needs a credit line. The modal will require a rights
   checkbox either way.
7. **Takedown contact.** Is the existing bug-report form fine as the contact for the library
   footer?
8. **Egress comfort.** Is the Supabase free plan acceptable for launch, with a monthly look at
   the usage page, or do you want R2 from the start?
9. **Ticket order.** Phase 1 first, then Phase 2? Or ship Phase 1 and publish by hand in the
   Dashboard until you want the publish button?

## What I could not verify

- Current Supabase free-plan egress and storage numbers (I used 5 GB egress and 1 GB storage
  from memory; check the dashboard).
- That `touch_records_updated_at` is safe on this table's first insert without
  `updated_at` supplied (it is used the same way on `user_records`, so I expect yes).
- That the Supabase local stack accepts `storage.buckets` inserts with `allowed_mime_types`
  (the column exists in current Supabase Storage; confirm in `e2e:live` during Phase 1).
- No SQL was run, locally or remotely. The draft hasn't been linted against the Supabase
  advisor.
