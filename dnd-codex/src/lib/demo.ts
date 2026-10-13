// Interactive demo mode (T-32). The app is local-first, so "a demo copy of the
// site" is just the same app pointed at a throwaway IndexedDB, seeded with a
// sample campaign, with persistent writes disabled. Entering sets a per-tab
// sessionStorage flag and reloads; `db` then opens the DEMO database instead of
// the real one, so real data is never touched. Everything resets on exit (and
// closing the tab drops the flag on its own).

const FLAG = 'codex-demo'
export const DEMO_DB_NAME = 'dnd-codex-demo'
export const REAL_DB_NAME = 'dnd-codex'

/** True when this tab is running the demo. Read at startup to pick the DB name. */
export function isDemo(): boolean {
  try {
    return sessionStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}

/** Enter the demo: flag this tab, wipe any stale demo DB, reload to a fresh seed. */
export async function enterDemo(): Promise<void> {
  try {
    sessionStorage.setItem(FLAG, '1')
  } catch {
    /* private mode — demo just won't persist the flag; harmless */
  }
  await deleteDemoDb()
  location.hash = '#/'
  location.reload()
}

/** Exit the demo: clear the flag, wipe the demo DB, reload into the real app. */
export async function exitDemo(): Promise<void> {
  try {
    sessionStorage.removeItem(FLAG)
  } catch {
    /* ignore */
  }
  await deleteDemoDb()
  location.hash = '#/'
  location.reload()
}

function deleteDemoDb(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DEMO_DB_NAME)
      req.onsuccess = req.onerror = req.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}

// --- blocked-write notification channel -----------------------------------
// Repo mutations and gated buttons call notifyDemoBlocked() to raise the
// "non-functional in demo" prompt; a single top-level toast subscribes.

/** Thrown by the repo backstop when an explicit write is attempted in the demo. */
export class DemoBlockedError extends Error {
  constructor() {
    super('This action is disabled in the demo.')
    this.name = 'DemoBlockedError'
  }
}

let blockedHandler: (() => void) | null = null

/** Subscribe the global toast to blocked-write events. Returns an unsubscribe. */
export function onDemoBlocked(fn: () => void): () => void {
  blockedHandler = fn
  return () => {
    if (blockedHandler === fn) blockedHandler = null
  }
}

/** Raise the "non-functional in demo" prompt. No-op outside the demo. */
export function notifyDemoBlocked(): void {
  if (isDemo()) blockedHandler?.()
}

/**
 * Wrap a button handler so that, in the demo, it raises the "non-functional in
 * demo" prompt instead of running (the proactive guard on the top New / Upload /
 * Delete buttons). Outside the demo it runs the handler unchanged.
 */
export function demoGuard<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  return (...args: A) => {
    if (isDemo()) {
      notifyDemoBlocked()
      return
    }
    fn(...args)
  }
}
