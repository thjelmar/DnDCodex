import { db } from '../db/db'
import { importSnapshot } from '../db/repo'
import { DEMO_SNAPSHOT, DEMO_SEED_VERSION } from '../data/demoSeed'

// Where the seeded version is recorded. This key belongs to the demo only; the
// real app never reads it.
export const DEMO_SEED_VERSION_KEY = 'codex-demo-seed-version'

function storedVersion(): number | null {
  try {
    const raw = localStorage.getItem(DEMO_SEED_VERSION_KEY)
    return raw === null ? null : Number(raw)
  } catch {
    return null
  }
}

function recordVersion(): void {
  try {
    localStorage.setItem(DEMO_SEED_VERSION_KEY, String(DEMO_SEED_VERSION))
  } catch {
    /* storage blocked: the next entry just reseeds */
  }
}

// Loads the sample campaign into the (throwaway) demo database. Called once at
// startup when the tab is in demo mode, before the app renders. The demo
// database can outlive a deploy (a reload keeps it), so the seed is replaced when
// its recorded version differs from DEMO_SEED_VERSION or a seeded campaign is
// missing. This runs only against the demo database (`db` is the demo DB in demo
// mode), never the real one.
export async function seedDemoIfNeeded(): Promise<void> {
  try {
    const seededIds = DEMO_SNAPSHOT.campaigns.map((c) => c.id)
    const present = await db.campaigns.bulkGet(seededIds)
    const complete = present.every(Boolean)
    if (complete && storedVersion() === DEMO_SEED_VERSION) return
    await importSnapshot(DEMO_SNAPSHOT, 'replace')
    recordVersion()
  } catch {
    // A failed seed shouldn't block the app from rendering (empty demo is still
    // navigable); the banner's Exit always works.
  }
}
