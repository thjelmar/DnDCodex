# End-to-end tests

Browser tests for the core flows, run with [Playwright](https://playwright.dev) in Chromium.

```bash
cd dnd-codex
npm install            # once, to get @playwright/test
npx playwright install chromium   # once per Playwright version
npm run e2e
```

`npm run e2e` starts its own Vite dev server on port 5174 (`reuseExistingServer` is
off, so a server you already run never gets picked up). That server always gets a
placeholder Supabase config (`e2e-placeholder.supabase.co`). No real keys are read or
needed. The fixtures in `fixtures.ts` abort every request to `*.supabase.co` and record
it.

## What runs

| File | Covers | Needs |
| --- | --- | --- |
| `core-flows.spec.ts` | Create a campaign, a session, and a battle map (the live scene the DM shows players). Reload and check they persist. | Nothing. Local only. |
| `demo-isolation.spec.ts` | Demo mode makes zero `supabase.co` requests. Each demo surface is checked with `performance.getEntriesByType('resource')`. A positive control confirms the check can see a Supabase request. | Nothing. Local only. |
| `sync-repair.spec.ts` | Sync delete (a deleted record must not come back) and Repair sync (restores a missing live record). | A local Supabase stack. Skipped in `npm run e2e`; run with `npm run e2e:live`. |

## Live sync tests

`sync-repair.spec.ts` checks sync delete (T-14) and Repair sync (T-29) against a real
Supabase backend. `npm run e2e` skips them. Run them against a **local** Supabase stack:

```bash
brew install supabase/tap/supabase colima docker   # once
colima start                                       # once per boot; starts Docker
cd dnd-codex
supabase start -x studio,imgproxy,edge-runtime,logflare,vector,mailpit,supavisor
npm run e2e:live
supabase stop                                      # when you're done
```

`supabase start` applies every file in `supabase/migrations/`. `npm run e2e:live`
(`scripts/e2e-live.mjs`) reads the stack's URL and keys from `supabase status`, passes
them to Playwright as environment variables, and starts the dev server pointed at the
local stack. No key is written to a file or printed.

- The script and `playwright.config.ts` refuse any backend that isn't on `127.0.0.1`,
  `localhost`, or `[::1]`. Never point these tests at a real project.
- To use a different local backend, set `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, and
  `E2E_SUPABASE_SERVICE_KEY` (names only here; set the values in your shell).
- The app signs in with OAuth only, so each test creates a throwaway user through the
  auth admin API, signs it in with a password grant, and injects the session into the
  browser's `localStorage`. After each test the user and its campaigns are deleted.
- The delete test holds writes to `records` so the tombstone stays in the outbox while a
  pull runs. The repair test removes a record from IndexedDB only, then clicks **Repair
  sync**.

## Known gap found while writing the tests

With a backend configured, Run mode reads `live_sessions` from Supabase even while
signed out. The fixtures abort the request, and the core-flow test passes. Demo mode
is not affected: `demo-isolation.spec.ts` checks it.
