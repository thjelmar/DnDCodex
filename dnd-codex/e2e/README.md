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
| `sync-repair.spec.ts` | Sync delete (a deleted record must not come back) and Repair sync (reconcile restores a missing live record). | **Skipped.** See below. |

## Why the sync tests are skipped

The sync engine only runs for a signed-in user. The app signs in with OAuth (Discord
or Google) and nothing else, so a test account cannot complete sign-in in CI. Faking
the cloud would test the fake, not the sync code. The skipped tests keep the intended
steps as comments.

To run them for real, a follow-up needs a local Supabase stack with the migrations
applied, plus a test user whose session is injected into the browser. Then the skip
comes off. Use only test values, never production keys.

## Known gap found while writing the tests

With a backend configured, Run mode reads `live_sessions` from Supabase even while
signed out. The fixtures abort the request, and the core-flow test passes. Demo mode
is not affected: `demo-isolation.spec.ts` checks it.
