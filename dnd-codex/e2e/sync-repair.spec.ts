import { test } from './fixtures'

// Sync delete and Repair sync (T-14, T-29). These tests cannot run locally yet.
// The sync engine only runs for a signed-in user, and the app signs in with OAuth
// (Discord or Google) only. No test account can complete that flow in CI, and
// faking the cloud would test the fake, not the sync code. The skip is deliberate.
// See e2e/README.md for what a live run needs and the follow-up ticket.
const REASON = 'Needs a signed-in session on a live Supabase backend (OAuth only). See e2e/README.md.'

test.describe('sync delete and Repair sync (live backend)', () => {
  test.skip(true, REASON)

  test('a locally deleted record does not come back after a pull', async () => {
    // 1. Sign in; enable sync on a campaign; wait for the first push.
    // 2. Delete an NPC locally; the tombstone waits in the outbox (op 'del').
    // 3. Trigger a pull before the tombstone lands; the NPC must stay deleted.
    // 4. After the tombstone pushes, the cloud row has deleted = true.
  })

  test('Repair sync restores a live record that is missing locally', async () => {
    // 1. Sign in; enable sync; confirm the record is in the cloud.
    // 2. Remove the record from IndexedDB only (simulate a dropped local copy).
    // 3. Open Backup and click "Repair sync (re-pull from cloud)".
    // 4. The record is back in IndexedDB, and the toast reports the re-synced campaign.
  })
})
