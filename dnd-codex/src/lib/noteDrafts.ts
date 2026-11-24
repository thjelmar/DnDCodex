// In-memory drafts for the session notes editors. The side panel unmounts its tab
// whenever you switch tabs, leave full screen, or open a drawer, and the editor's
// last keystrokes are still being written to the database at that moment. The
// remounted editor would read the older saved text, show it, and then overwrite the
// newer text on the next keystroke. A draft carries the latest text across that gap
// until the write has finished. (The player editor keeps its draft as the latest known text.)
const drafts = new Map<string, unknown>()

const listeners = new Map<string, Set<(value: unknown) => void>>()

export function setDraft<T>(key: string, value: T): void {
  const same = JSON.stringify(drafts.get(key)) === JSON.stringify(value)
  drafts.set(key, value)
  if (!same) listeners.get(key)?.forEach((fn) => fn(value))
}

/** Calls `fn` when another editor of the same note changes the draft (the page's panel
 *  and the full-screen panel can be mounted at once). Returns an unsubscribe. */
export function onDraft<T>(key: string, fn: (value: T) => void): () => void {
  const set = listeners.get(key) ?? new Set()
  const cb = fn as (value: unknown) => void
  set.add(cb)
  listeners.set(key, set)
  return () => { set.delete(cb) }
}

export function getDraft<T>(key: string): T | undefined {
  return drafts.get(key) as T | undefined
}

/** Drops the draft once its text is saved, unless newer text replaced it meanwhile (compared by value). */
export function clearDraft(key: string, value: unknown): void {
  if (JSON.stringify(drafts.get(key)) === JSON.stringify(value)) drafts.delete(key)
}
