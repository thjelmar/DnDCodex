import { db } from '../db/db'
import { importSnapshot } from '../db/repo'
import { DEMO_SNAPSHOT } from '../data/demoSeed'

// Loads the sample campaign into the (throwaway) demo database. Called once at
// startup when the tab is in demo mode, before the app renders. enterDemo()
// deletes the demo DB first, so this normally runs against an empty database;
// the emptiness check keeps a manual reload from re-importing needlessly.
export async function seedDemoIfNeeded(): Promise<void> {
  try {
    if ((await db.campaigns.count()) > 0) return
    await importSnapshot(DEMO_SNAPSHOT, 'replace')
  } catch {
    // A failed seed shouldn't block the app from rendering (empty demo is still
    // navigable); the banner's Exit always works.
  }
}
