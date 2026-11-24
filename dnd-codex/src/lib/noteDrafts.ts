// In-memory drafts for the session notes editors. The side panel unmounts its tab
// whenever you switch tabs, leave full screen, or open a drawer, and the editor's
// last keystrokes are still being written to the database at that moment. The
// remounted editor would read the older saved text, show it, and then overwrite the
// newer text on the next keystroke. A draft carries the latest text across that gap
// until the write has finished.
const drafts = new Map<string, unknown>()

export function setDraft<T>(key: string, value: T): void {
  drafts.set(key, value)
}

export function getDraft<T>(key: string): T | undefined {
  return drafts.get(key) as T | undefined
}

/** Drops the draft once its text is saved, unless newer text replaced it meanwhile (compared by value). */
export function clearDraft(key: string, value: unknown): void {
  if (JSON.stringify(drafts.get(key)) === JSON.stringify(value)) drafts.delete(key)
}
