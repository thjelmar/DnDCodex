# Supabase memory investigation

Date: November 20, 2026 · Branch: `claude/exciting-lovelace-681e8f` (cut from `origin/dev` at `9623e8a`) · Status: investigation only, no app code or SQL changed

The owner's Supabase dashboard shows the project's memory peaking at the 90% alert threshold (about 1.38 GB). This document ranks what in the app could drive that, shows the evidence, and proposes fixes. It also gives you a read-only SQL pack to run in the Supabase SQL Editor, because the live database's real load is the one thing this investigation can't see.

## Summary

- **The most likely code-driven cause is base64 image data moving through Postgres, PostgREST, and Realtime as whole rows.** Gallery, handout, portrait, and cover images sync inside `records.data` (JSONB), and `shared_images.data_url`, `shared_scene_maps.data_url`, and `bug_reports.screenshot` hold more base64. Only battle-map images use Storage.
- **The peaks fit this cause.** Sync pushes a whole campaign in one request, and a full re-pull fetches 500 rows per page. A local test of a 17 MB campaign pushed through PostgREST added 133 MiB to the database container and 75 MiB to PostgREST.
- **Counter-evidence matters.** The nightly dump on October 28 was 1.3 MB for the entire `public` schema. If the owner's data is still that small, image volume can't explain a 1.38 GB commitment, and the cause is mostly the fixed footprint of Supabase's services plus cache on a small compute size. Query D3 in the diagnostics pack settles this in seconds.
- **Everything else is small.** Polling, `pg_cron`, the Pi jobs, the Daily Duel tally, the battle map library, indexes, and channel counts either measured as negligible or are too small to matter.

Run the diagnostics in [the diagnostics pack](#diagnostics-pack) before changing code. The first three results (D1, D3, and the peak-time check in D0) decide which phase of the fix plan to start with.

## What I measured, and what I inferred

I ran every measurement against the local Supabase stack (`supabase start` through colima, loopback only), using a throwaway user and campaign that the script deleted afterward. I touched no real project, key, or URL. The local stack was already running for another session's end-to-end tests, so I did not reset it, and I did not run the app's own test suite.

| Label | Meaning |
| --- | --- |
| **Measured** | I ran it locally and recorded the number. |
| **Code-derived** | I read the code path and can state what it does, but did not time it. |
| **Inferred** | A reasoned guess from general Supabase or Postgres behavior. The owner's data can confirm or refute it. |

Measurement caveats: the numbers come from `docker stats` (container cgroup memory), sampled every one to two seconds, one run each. Test images are random bytes encoded as base64, which approximates already-compressed WebP. The local Realtime is v2.151.3 and Postgres is 17.11, which might differ from the hosted project. Use the numbers for relative size, not as predictions of the hosted dashboard.

## Ranked contributors

| # | Contributor | Evidence label | Confidence it matters | Effort | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | Base64 images stored in rows (`records`, `shared_images`, and others) | Measured + code-derived | High that it is the largest per-event cost; medium that it explains the observed peak | Medium–large | Medium (needs a backfill) |
| 2 | Whole-campaign push and full re-pull in one request | Measured + code-derived | Medium–high for the *peaks* | Small | Low |
| 3 | Realtime sends the full row to every subscriber, and the client re-pulls its own writes | Measured + code-derived | Medium | Small–medium | Low–medium |
| 4 | Fixed footprint: Supabase services, `shared_buffers`, and page cache on a small compute size | Inferred | Medium–high that a large share of 1.38 GB is baseline | None (owner decision) | None |
| 5 | Connections and background polling | Measured (query cost) + inferred (counts) | Low–medium | Small | Low |
| 6 | Nightly `pg_dump` at 03:30 through the session pooler | Code-derived | Low–medium (depends on peak time) | Small | Low |
| 7 | Owner Tickets page `select=*` (screenshots) | Code-derived | Low | Small | Low |
| 8 | Unbounded tables: tombstones, `cron.job_run_details`, `reminder_log`, `daily_duel_results` | Code-derived | Low today | Small | Low |
| 9 | Missing foreign-key indexes (T-60) | Measured (catalog) | Very low | Small | Low |

### 1. Base64 images in rows

**What happens.** `StoredImage.dataUrl` is a base64 data URL. `pushCampaign` ships it inside `records.data` unless the image has a `storagePath`, and only battle-map images get one ([sync.ts:241-249](../../dnd-codex/src/lib/sync.ts:241)). Gallery images, handouts, portraits, and covers all travel as base64 JSONB. Images are resized to at most 1600 px ([image.ts:15](../../dnd-codex/src/lib/image.ts:15)), so a single image is typically 100–400 KB of text after base64 encoding.

Four more places hold base64 in the database:

- `shared_images.data_url` (migration 0006). `getSharedImages` selects `data_url` for every image in the campaign, with no limit, on every mount and on every Realtime event ([cloud.ts:226-245](../../dnd-codex/src/auth/cloud.ts:226)).
- `shared_scene_maps.data_url` (migration 0015). The legacy path, replaced by Storage in migration 0021 but not migrated. Old rows might still exist.
- `shared_scene_tokens.portrait` (migration 0015). A 96 px thumbnail, a few KB per token. Small, but the table has `REPLICA IDENTITY FULL`, so every token move logs the portrait twice.
- `bug_reports.screenshot` (migration 0009). The Pages Function accepts up to 6,000,000 characters per screenshot ([bug-report.ts:43](../../dnd-codex/functions/api/bug-report.ts:43)).

**Measured.** A 540-row campaign (40 images of 300 KB, 500 small notes) holds 16 MB in TOAST while the heap is 176 kB and the index is 112 kB. Postgres memory pressure comes from TOAST pages cycling through `shared_buffers`, not from indexes or row counts.

**Why it matters.** Every path in the next two sections multiplies this volume.

**Fix.** Store image binaries in a Storage bucket and keep only a path in the row. The mechanism already exists for battle maps (`storagePath`, [sync.ts:245](../../dnd-codex/src/lib/sync.ts:245), migration 0021). Extend it to every `images` row and to `shared_images`. This needs one additive migration (a nullable `storage_path` column on `shared_images`, plus a member-read bucket policy modeled on 0021) and client code that uploads, strips `dataUrl`, and lazy-loads. Existing rows keep working until the client backfills them. See Phase 2.

### 2. Whole-campaign push and full re-pull

**Code-derived.** `pushCampaign` builds one `rows` array and sends it in a single `upsert` ([sync.ts:229-254](../../dnd-codex/src/lib/sync.ts:229)). There is no batching. These callers queue whole campaigns:

- `enableSync` and `bootstrap` for a campaign that isn't in the cloud yet (`enqueueWholeCampaign`).
- `resyncSyncedCampaigns` after a snapshot import.
- `repairSyncedCampaigns` (the **Repair sync** button) and `reconcileCampaign`, which rewind the pull cursor to zero ([sync.ts:365-380](../../dnd-codex/src/lib/sync.ts:365)). A rewind pulls every row again, 500 rows per page, including every image's `data`.
- A new device or a cleared browser pulls from cursor zero.

**Measured.**

| Operation (17.3 MB campaign) | Time | Database container | PostgREST container |
| --- | --- | --- | --- |
| One bulk upsert of the whole campaign | 2.0 s | 196 → 329 MiB (+133) | 23 → 98 MiB (+75) |
| One full pull page (500-row limit, 17.2 MB response) | 2.0 s | flat | 98 → 150 MiB (+52) |
| Reconcile count (`head`, `count=exact`) | under 2 s | flat | flat |
| Incremental poll with nothing new | under 2 s | flat | flat |

The same bulk upsert on the hosted project also commits a request body of that size in PostgREST and parses it in a Postgres backend before it hits any table. Several of these in a row (for example, repair on two devices) stack up.

**Fix.** Split pushes into batches of at most about 1 MB or 20 rows, and pull with a smaller page when rows are large. This is client-only and small. See Phase 1.

### 3. Realtime fan-out of full rows

**Measured.** I opened 56 `postgres_changes` channels (about 7 users × 8 channels) as one authenticated user. They added 56 rows to `realtime.subscription` and moved neither the database nor the Realtime container, so channel count is not the problem. Then I wrote 20 image records of 300 KB each (6 MB) with 7 live `records` subscribers:

- Realtime delivered 140 events (20 rows × 7 subscribers), about 54.7 MB in total. That is roughly 9× the data written.
- The database container grew from 319 to 409 MiB (+90) and the Realtime container by about 30 MiB.
- Re-writing the same rows unchanged produced the same 140 events. Postgres has no no-op write suppression.

**Why.** `records` and `user_records` are in the `supabase_realtime` publication ([0005_records.sql](../../dnd-codex/supabase/migrations/0005_records.sql), [0036_user_records.sql](../../dnd-codex/supabase/migrations/0036_user_records.sql)). The client uses the event only as a signal to pull ([sync.ts:539-549](../../dnd-codex/src/lib/sync.ts:539)), so the payload is wasted. Realtime also evaluates each subscriber's RLS policy per event. In addition, 13 tables use `REPLICA IDENTITY FULL` (the migration 0008 fix), which writes the full old row to the WAL on every update.

**Code-derived echo.** After a push, the client deliberately does not move the pull cursor past its own writes ([sync.ts:257-260](../../dnd-codex/src/lib/sync.ts:257)), so the next pull and the Realtime-triggered pull download the rows the device just uploaded.

**Fix.** Two options, in order of effort:

1. Keep the publication, but stop fetching your own writes: advance the cursor to the maximum `updated_at` returned by the push (the upsert can return `updated_at` with `Prefer: return=representation` limited to `kind,id,updated_at`) when no other device wrote in between. Client-only.
2. Replace the `records` publication with a small signal table (one row per campaign, bumped by a trigger) so events carry bytes instead of megabytes. Needs a migration and a deploy order (old clients keep working through the 60 s poll). See Phase 2.

### 4. Fixed footprint of a small compute size

**Inferred, with a local reference.** On a hosted project, Postgres, PostgREST, GoTrue, Realtime, Storage, and the pooler share the instance's RAM with the operating system's page cache, and Postgres fills `shared_buffers` (about 25% of RAM by default) as it reads. A dashboard that counts "used + cache" climbs toward the limit by design, even when nothing leaks.

The local reference: the idle local stack, with zero application rows, used about 983 MiB across seven containers (database 196, Realtime 229, Kong 184, postgres-meta 181, Storage 158, PostgREST 23, GoTrue 11). The hosted layout differs (Kong and postgres-meta don't run on the database instance), so don't equate the numbers. The point is that Supabase's own services are a large share of memory before any app data.

Evidence against a data-driven cause: the first nightly dump on October 28 was 1,294,157 bytes for the whole `public` schema (recorded in the project's Pi services memory note), and the app has about 7 users. 56 channels and the poll queries measured flat.

**Action.** None in code. The owner should confirm the compute tier and which memory series crosses 90% (see D0 and [owner-only settings](#settings-the-owner-can-change)).

### 5. Connections and background polling

**Measured cost of one poll.** The incremental pull is an index scan on `records_campaign_updated_idx`: 0.023 ms and 1 buffer hit. The reconcile count is 0.18 ms and 23 buffer hits. CPU and memory per poll are negligible.

**Code-derived volume.** `SyncProvider` runs `syncAll` and `syncGlobal` every 60 seconds and on every `visibilitychange` ([SyncProvider.tsx:136-153](../../dnd-codex/src/auth/SyncProvider.tsx:136)). The interval keeps running in a hidden tab (browsers throttle it but don't stop it). A DM with 3 campaigns and 2 devices makes about 4 × 2 × 1,440 ≈ 11,500 small requests per day.

**Why it might still matter.** Steady traffic keeps PostgREST pool connections and Postgres backends alive. Each idle Postgres backend holds several MB of cache. Whether this matters depends on the connection counts in D8.

**Realtime channel count (code-derived).** A signed-in DM on a campaign page opens roughly: `records-<id>` per synced campaign, `user_records-<id>`, `notifications-<user>`, and from `LiveSceneKeeper` (mounted in `CampaignLayout` for every campaign page): a live-scene channel (2 tables), a live-session channel, and a `members-` channel. Run mode and the planner add more. Every channel is removed on unmount (`removeChannel` appears in every hook), and names carry a random suffix to avoid collisions. I found no leaked or doubled subscription. The 56-channel measurement shows the cost is low even at 4× this count.

### 6. Nightly `pg_dump`

**Code-derived.** [db-backup.sh](../../dnd-codex/pi/backup/db-backup.sh) dumps the `public` schema through the session pooler at 03:30 (plus up to 10 minutes of random delay). `pg_dump` reads every table, including all TOAST data, so it churns `shared_buffers` once a night. At 1.3 MB it is harmless; with tens of MB of base64 it becomes a nightly peak. The 5-minute uptime check calls only `/auth/v1/health` and costs nothing.

**Check.** If the dashboard's memory peak lines up with 03:30 local Pi time (or the equivalent UTC time), this is the cause. Also run `ls -l ~/codex-backups/db` on the Pi: the dump sizes over three weeks are a free growth curve.

### 7. Owner Tickets page

**Code-derived.** `GET /api/bug-reports` selects `*` from `bug_reports` with embedded comments and commits ([bug-reports.ts:162](../../dnd-codex/functions/api/bug-reports.ts:162)), so every Tickets page load returns every screenshot (up to 6 MB each). Only site reports carry screenshots. The `tickets` CLI uses explicit column lists and is not affected. Only the owner opens this page, so the frequency is low.

### 8. Unbounded tables

**Code-derived, all small today:**

- Tombstones in `records` and `user_records` are never purged. A tombstone is a few hundred bytes (`{id, updatedAt}`), but the rewind-to-zero pull still scans them.
- `cron.job_run_details` grows by 96 rows per day from `reminders-tick` (every 15 minutes). That is about 35,000 rows per year.
- `reminder_log` grows with each reminder sent and is never purged.
- `daily_duel_results` is capped at 5,000 rows per day by `record_duel_result` ([0041](../../dnd-codex/supabase/migrations/0041_daily_duel_tally.sql)). Rows are about 100 bytes. Worst case is about 1.8 million rows per year. The function runs `count(*)` over the day's rows on every insert, which the `(day, device_id)` unique index serves.

`reminders-tick` itself is cheap: one `session_schedule` select per tick, and per-campaign queries only when a reminder is due ([reminders-tick.ts:158-165](../../dnd-codex/functions/api/reminders-tick.ts:158)).

### 9. Missing foreign-key indexes

**Measured (catalog).** On the local stack built from all 43 migrations, 18 foreign keys lack a leading index, including `shared_images(campaign_id)`, `shared_entities(campaign_id)`, `shared_scene_maps(campaign_id)`, `shares(campaign_id, from_user, to_user)`, and `notifications(campaign_id)`. T-60 already tracks these. The effect is slow cascade deletes and policy lookups on tables with few rows, so the memory effect is close to zero. Do it for hygiene, not for this problem.

### Checked and ruled out

- **Voice bot.** `useVoiceRoster` and the bot use Realtime *broadcast*, which never touches Postgres ([useVoiceRoster.ts](../../dnd-codex/src/lib/useVoiceRoster.ts), [bot/index.js:57](../../dnd-codex/bot/index.js:57)). The 5-second heartbeat sends a small payload and creates no database load. It counts toward Realtime message quota, not memory.
- **Battle map library (T-76, T-77).** `battleLibrary.ts` reads only the small catalogue table (explicit columns, `grid` is a few hundred bytes) and serves thumbnails and maps from a public bucket through the CDN ([battleLibrary.ts:48-76](../../dnd-codex/src/lib/battleLibrary.ts:48)). I found no Storage list calls.
- **supabase-js clients.** The app creates one client ([supabase.ts](../../dnd-codex/src/lib/supabase.ts)). The bot creates one at startup. The Pages Functions use plain `fetch` to PostgREST with the service role, so they hold no connections.
- **Daily Duel RPCs.** Three small security-definer functions with index-backed queries (see item 8).

## Diagnostics pack

Run these in the Supabase **SQL Editor**, one block at a time. Every query is **read-only** unless it says otherwise. "Heavy" means it might take a few seconds on a large database; none should affect a 7-user app.

### D0. Dashboard facts (no SQL)

Write down these answers; they change the interpretation of everything else:

1. **Compute size and plan** (Project settings → Compute and Disk). The numbers don't match a standard tier cleanly (1.38 GB at 90% implies about 1.53 GB), so confirm the tier.
2. **Which series crosses 90%** (Observability → Database → Memory). If the chart splits "used" from "cache and buffers", note which one reaches the limit. High cache is normal; high *used* is the one to investigate.
3. **When the peaks happen.** Match them against Friday sessions, the 03:30 backup, and the `*/15` reminder cron.
4. **Pi dump sizes:** `ls -l ~/codex-backups/db` on the Pi.

### D1. Settings

Result: the memory knobs the instance runs with. Compare `shared_buffers` against the compute size.

```sql
-- read-only
select name, setting, unit
from pg_settings
where name in ('shared_buffers','work_mem','maintenance_work_mem','max_connections',
               'effective_cache_size','logical_decoding_work_mem','max_wal_senders',
               'max_replication_slots','wal_level','autovacuum_work_mem')
order by name;
```

### D2. Table and index sizes

Result: where the bytes are. If one table dominates and its `toast` column is large, base64 data is the cause (contributor 1).

```sql
-- read-only
select c.relname as table,
       pg_size_pretty(pg_total_relation_size(c.oid))                          as total,
       pg_size_pretty(pg_relation_size(c.oid))                                as heap,
       pg_size_pretty(coalesce(pg_total_relation_size(c.reltoastrelid), 0))   as toast,
       pg_size_pretty(pg_indexes_size(c.oid))                                 as indexes,
       c.reltuples::bigint                                                    as est_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;
```

### D3. What `records` and `user_records` hold

Result: row count, stored size, and largest row per `kind`, plus tombstones. If `image` totals under about 20 MB, contributor 1 is a spike source, not a steady one. `pg_column_size` reports stored (compressed) size without decompressing the value, so this is light.

```sql
-- read-only
select kind,
       count(*)                                          as rows,
       count(*) filter (where deleted)                   as tombstones,
       pg_size_pretty(sum(pg_column_size(data))::bigint) as stored_size,
       pg_size_pretty(max(pg_column_size(data))::bigint) as largest_row
from public.records
group by kind
order by sum(pg_column_size(data)) desc;

select kind, count(*) as rows, pg_size_pretty(sum(pg_column_size(data))::bigint) as stored_size
from public.user_records
group by kind
order by 3 desc;

-- Per campaign (is one campaign the heavy one?)
select campaign_id, count(*) as rows, pg_size_pretty(sum(pg_column_size(data))::bigint) as stored_size
from public.records
group by campaign_id
order by sum(pg_column_size(data)) desc
limit 10;
```

### D4. Other tables that hold base64

Result: whether the legacy and sharing tables still hold large blobs. A non-zero `shared_scene_maps` count means legacy rows are still there.

```sql
-- read-only
select 'shared_images'     as tbl, count(*) as rows, pg_size_pretty(coalesce(sum(pg_column_size(data_url)),0)::bigint) as blob_size from public.shared_images
union all
select 'shared_scene_maps', count(*), pg_size_pretty(coalesce(sum(pg_column_size(data_url)),0)::bigint) from public.shared_scene_maps
union all
select 'shared_scene_tokens.portrait', count(*), pg_size_pretty(coalesce(sum(pg_column_size(portrait)),0)::bigint) from public.shared_scene_tokens
union all
select 'bug_reports.screenshot', count(*) filter (where screenshot is not null), pg_size_pretty(coalesce(sum(pg_column_size(screenshot)),0)::bigint) from public.bug_reports
union all
select 'shared_entities', count(*), pg_size_pretty(coalesce(sum(pg_column_size(data)),0)::bigint) from public.shared_entities
union all
select 'shares', count(*), pg_size_pretty(coalesce(sum(pg_column_size(payload)),0)::bigint) from public.shares;
```

### D5. Dead tuples and vacuum state

Result: tables with many dead tuples carry bloat that takes memory and cache. Rewritten image rows leave dead TOAST data until autovacuum runs.

```sql
-- read-only
select relname, n_live_tup, n_dead_tup,
       round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) as dead_pct,
       last_autovacuum, last_autoanalyze
from pg_stat_user_tables
order by n_dead_tup desc
limit 15;
```

### D6. Which tables churn the cache

Result: tables with the most block reads and hits, including TOAST. A table at the top with huge `toast_*` numbers is what the instance spends its memory and I/O on. The cache hit ratio should be above 99%.

```sql
-- read-only
select relname, heap_blks_read, heap_blks_hit,
       coalesce(toast_blks_read,0) as toast_blks_read, coalesce(toast_blks_hit,0) as toast_blks_hit
from pg_statio_user_tables
order by (heap_blks_read + heap_blks_hit + coalesce(toast_blks_read,0) + coalesce(toast_blks_hit,0)) desc
limit 10;

select round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit + heap_blks_read), 0), 2) as cache_hit_pct
from pg_statio_user_tables;
```

### D7. Top statements (`pg_stat_statements`)

Result: the queries that cost the most time, run most often, return the most rows, or spill to disk. A statement with high `rows` and `select ... data` on `records` confirms contributor 2. `temp_blks_written > 0` means a query exceeded `work_mem`.

First check the extension. If the first query returns no row, enable it (this **changes state** but is safe and low-overhead; the Dashboard route is **Database** → **Extensions** → `pg_stat_statements`, or run the `create extension` line).

```sql
-- read-only
select extname from pg_extension where extname = 'pg_stat_statements';

-- state change, safe: only if the query above returned no row
-- create extension if not exists pg_stat_statements with schema extensions;
```

```sql
-- read-only. By total time.
select left(regexp_replace(query, '\s+', ' ', 'g'), 140) as query,
       calls, round((total_exec_time/1000)::numeric, 1) as total_s,
       round(mean_exec_time::numeric, 2) as mean_ms, rows
from pg_stat_statements
order by total_exec_time desc
limit 15;

-- By calls
select left(regexp_replace(query, '\s+', ' ', 'g'), 140) as query, calls,
       round(mean_exec_time::numeric, 2) as mean_ms, rows
from pg_stat_statements
order by calls desc
limit 15;

-- By rows returned or written (bulk movers)
select left(regexp_replace(query, '\s+', ' ', 'g'), 140) as query, calls, rows,
       pg_size_pretty((shared_blks_read + shared_blks_hit) * 8192) as blocks_touched
from pg_stat_statements
order by rows desc
limit 15;

-- Spills past work_mem
select left(regexp_replace(query, '\s+', ' ', 'g'), 140) as query, calls,
       pg_size_pretty(temp_blks_written * 8192) as temp_written
from pg_stat_statements
where temp_blks_written > 0
order by temp_blks_written desc
limit 10;
```

### D8. Connections

Result: how many backends exist, who owns them, and how many sit idle. Many idle `authenticator` or `postgres` connections point to pool settings rather than data.

```sql
-- read-only
select usename, application_name, state, count(*) as connections
from pg_stat_activity
where backend_type = 'client backend'
group by usename, application_name, state
order by connections desc;

select backend_type, count(*) from pg_stat_activity group by backend_type order by 2 desc;

select (select setting::int from pg_settings where name = 'max_connections') as max_connections,
       (select count(*) from pg_stat_activity) as in_use;
```

### D9. Realtime

Result: the number of active `postgres_changes` subscriptions and which tables they watch. If the editor denies access to the `realtime` schema, skip this one. The slot query shows whether the Realtime replication slot is lagging.

```sql
-- read-only (needs access to the realtime schema)
select count(*) as subscriptions from realtime.subscription;

select entity::regclass as table_watched, count(*) as subscriptions
from realtime.subscription
group by 1
order by 2 desc;

-- read-only
select slot_name, active,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as wal_retained
from pg_replication_slots;
```

### D10. Scheduled jobs

Result: the cron jobs that exist, how many runs they have logged, and the size of the log table.

```sql
-- read-only
select jobid, jobname, schedule, active from cron.job;

select jobid, status, count(*) as runs, min(start_time) as first_run, max(start_time) as last_run
from cron.job_run_details
group by jobid, status
order by jobid;

select pg_size_pretty(pg_total_relation_size('cron.job_run_details')) as cron_log_size;
select count(*) as pg_net_responses, pg_size_pretty(pg_total_relation_size('net._http_response')) as size
from net._http_response;
```

### D11. Storage metadata

Result: object counts and sizes per bucket, and the size of the metadata table. This shows whether Storage rows matter to memory (they almost never do).

```sql
-- read-only
select bucket_id, count(*) as objects,
       pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) as total_size
from storage.objects
group by bucket_id
order by 2 desc;

select pg_size_pretty(pg_total_relation_size('storage.objects')) as storage_objects_size;
```

### D12. Unused and duplicate indexes

Result: indexes that no query has ever used (`idx_scan = 0`) and groups of identical indexes. `campaign_members_user_id_idx` (migration 0040) and any recent index can show 0 scans simply because they're new; don't drop them on this result alone.

```sql
-- read-only
select s.relname as table, s.indexrelname as index, s.idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) as size
from pg_stat_user_indexes s
join pg_index i on i.indexrelid = s.indexrelid
where s.idx_scan = 0 and not i.indisunique and not i.indisprimary
order by pg_relation_size(s.indexrelid) desc
limit 20;

select indrelid::regclass as table, array_agg(indexrelid::regclass) as duplicate_indexes
from pg_index
group by indrelid, indkey, indclass, indpred::text, indexprs::text
having count(*) > 1;
```

### D13. Temp-file and database-level stats (optional)

Result: temp-file use shows `work_mem` spills; `numbackends` and the stats-reset time give context for every counter above.

```sql
-- read-only
select datname, numbackends, temp_files, pg_size_pretty(temp_bytes) as temp_bytes, stats_reset
from pg_stat_database
where datname = current_database();
```

### D14. What is in `shared_buffers` (optional, changes state)

Result: which relations occupy the buffer cache right now. This **adds an extension** (`pg_buffercache`), which is harmless and removable with `drop extension pg_buffercache`. Run it only if D2 and D6 leave the question open.

```sql
-- state change, safe, removable: create extension if not exists pg_buffercache;
select c.relname, count(*) as buffers, pg_size_pretty(count(*) * 8192) as size
from pg_buffercache b
join pg_class c on b.relfilenode = pg_relation_filenode(c.oid)
join pg_database d on b.reldatabase = d.oid and d.datname = current_database()
group by c.relname
order by buffers desc
limit 15;
```

### How to read the results

| Result | What it means | What to do |
| --- | --- | --- |
| D3 `image` rows total under about 20 MB, and the dashboard's *used* series is mostly flat | Data volume isn't the driver. Contributor 4 (fixed footprint) dominates. | Run Phase 1 only, then decide on a compute upgrade (owner). |
| D3 or D4 shows tens or hundreds of MB of base64, or D6 shows TOAST reads dominating | Contributors 1–3 are real. | Do Phase 1 now, then Phase 2 (Storage migration). |
| D7 shows `records` selects with huge `rows` or a bulk upsert near the top | Contributor 2. | Chunk pushes and pulls (Phase 1). |
| D8 shows dozens of idle connections | Connection overhead (contributor 5). | Review the pooler settings; poll less. |
| Peak time matches 03:30 | Contributor 6. | Dump less often, or after Storage migration shrinks the data. |
| D9 shows hundreds of subscriptions | A client is leaking channels (I found none in code). | Capture the table split and re-check the hooks. |

## Fix plan

All migrations must be additive: the dev and live sites share one database, and the owner runs SQL by hand in the SQL Editor.

### Phase 0: facts (owner, no code)

1. Answer D0 and run D1, D2, D3, D4, D7, and D8. Paste the results into the hub session.
2. Check `ls -l ~/codex-backups/db` on the Pi.

### Phase 1: quick, safe, client-only

| Change | Needs a migration? | Effort | Risk |
| --- | --- | --- | --- |
| **Chunk `pushCampaign` and `globalSync` pushes** into batches of about 1 MB or 20 rows, in order | No | Small | Low |
| **Smaller pull pages** when rows are large (for example, limit 100, or stop at about 2 MB per page) | No | Small | Low |
| **Skip the self-echo:** after a push, advance the cursor when no foreign write sits between the old cursor and the pushed rows | No | Small | Medium: the cursor logic guards against a past data-loss bug (sync-delete race, T-14, T-29), so add a test first |
| **Pause the 60 s flush while the tab is hidden**, and slow it to a few minutes while the `records` channel is `SUBSCRIBED` | No | Small | Low |
| **Shared images: list without `data_url`**, then load each image by id on demand | No | Small | Low |
| **Tickets page and `GET /api/bug-reports`: exclude `screenshot` from the list**, fetch one on demand | No (Function change) | Small | Low |
| **Keep the Repair sync button, but make it pull in small pages** | No | Small | Low |

### Phase 2: structural, with additive migrations

| Change | Needs a migration? | Effort | Risk |
| --- | --- | --- | --- |
| **Move gallery, handout, portrait, and cover images to Storage.** Add `shared_images.storage_path` (nullable) and a member-read bucket with policies modeled on 0021. The client uploads, strips `dataUrl` from `records` (generalize [sync.ts:245](../../dnd-codex/src/lib/sync.ts:245)), and backfills existing rows on the next sync. Old clients keep reading `data_url` until it is cleared. | Yes (additive: nullable column, new bucket and policies) | Medium–large | Medium: needs a backfill, and a rollback path that keeps `dataUrl` locally |
| **Drain the legacy `shared_scene_maps.data_url` rows** (if D4 shows any) with a one-off delete or by letting `stopLiveScene` clear them | No (a one-time cleanup statement) | Small | Low |
| **Replace `records` and `user_records` Realtime payloads with a small signal.** Add a `campaign_sync_ticks` table (campaign id, `updated_at`) bumped by a trigger on `records`; clients subscribe to it instead of `records`. Remove `records` from the publication only after every client has shipped the change. | Yes (additive table and trigger; the publication change comes last) | Medium | Medium: an ordering dependency between deploy and migration; old clients fall back to the 60 s poll |
| **Retention:** weekly `pg_cron` job to purge tombstones older than 90 days (`records`, `user_records`), `reminder_log` older than 30 days, and `cron.job_run_details` older than 7 days. Optionally purge `daily_duel_results` older than 90 days. | Yes (additive: new cron jobs) | Small | Low: a purged tombstone can resurrect a record on a device that was offline longer than the window, so pick 90 days or more |
| **T-60:** add the missing foreign-key indexes (already ticketed) | Yes | Small | Low |

### Phase 3: owner decisions (Supabase side)

These are the owner's to decide. I can't see the project, so setting names and defaults below come from general Supabase behavior; verify them in the dashboard.

| Setting | Trade-off |
| --- | --- |
| **Compute size** (Project settings → Compute and Disk) | The direct fix for a 90% alarm. A larger tier raises the limit for a monthly price. If D3 shows tiny data, this is the honest answer and no code change will lower the fixed footprint much. |
| **Memory alert threshold** | If the "used" series is flat and only cache grows, raising or removing the alert avoids false alarms. |
| **Connection pooling** (Database → Connection pooling) | Transaction mode with a smaller pool lowers backend count. The Pi backup uses the session pooler and needs session mode. Changing pool size can briefly drop connections. |
| **Realtime limits** (Realtime → Settings) | Lower "max events per second" and "max concurrent clients", and a payload-size cap if the dashboard offers one. These protect against bursts but also cut off legitimate live sessions if set too low. |
| **`pg_stat_statements`** | Enable it (D7). Low overhead, and it gives you permanent visibility into the top queries. |
| **Read replica or backups schedule** | Not needed at this scale; listed only because it appears in the dashboard. |

## Tickets

I created these tickets without starting them. Each links back to this document and says when to start.

| Ticket | Phase | Change |
| --- | --- | --- |
| T-79 | 1a | Chunk sync pushes and pulls, pause the hidden-tab poll |
| T-80 | 1b | Stop listing base64 in shared images and ticket screenshots |
| T-81 | 2a | Move gallery, handout, portrait, and cover images to Storage |
| T-82 | 2b | Replace `records` Realtime payloads with a small sync signal |
| T-83 | 2c | Retention jobs for tombstones, `reminder_log`, and cron history |

T-60 (foreign-key indexes) already exists.

## What I couldn't verify

- The live database's size, row counts, connection counts, subscription counts, top statements, and which memory series crosses 90%. Only the diagnostics pack can answer these.
- The compute tier and plan, and whether the dashboard chart includes page cache.
- Hosted Realtime and PostgREST behavior. I measured local containers (Realtime 2.151.3, PostgREST 16.5, Postgres 17.11).
- Real image sizes. I assumed 300 KB per image from the 1600 px resize cap and WebP output.
- The client-side cost of the self-echo pull. I derived it from the code comment at [sync.ts:257](../../dnd-codex/src/lib/sync.ts:257) and did not time it.
- Fog and template payload sizes during live play. `shared_scenes.fog` is rewritten whole on each change (250 ms debounce) and logged twice because of `REPLICA IDENTITY FULL`. I expect tens of KB per write during painting, but I did not measure it.

The measurement scripts lived in the session scratchpad and are not part of this branch. The throwaway campaign and user were deleted, and I confirmed zero leftover rows.
