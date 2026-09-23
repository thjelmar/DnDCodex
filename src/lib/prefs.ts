import { SECTIONS, type ShareableKind } from './reveal'

// ---------------------------------------------------------------------------
// Per-browser user preferences (localStorage). Central source of truth for the
// keys so the features that SET a preference and the Preferences panel that
// RESETS it never drift apart.
// ---------------------------------------------------------------------------

const CONFIRM_SKIP_PREFIX = 'codex.confirmSkip.'

/** The shared "don't ask again" key used by the reveal-to-players confirm. */
export const REVEAL_CONFIRM_KEY = 'spoiler-reveal'

/** Whether a "don't ask again" confirm with this key has been dismissed for good. */
export function isConfirmSkipped(key: string): boolean {
  try {
    return localStorage.getItem(CONFIRM_SKIP_PREFIX + key) === '1'
  } catch {
    return false
  }
}

/** Set or clear the "don't ask again" state for a confirm key. */
export function setConfirmSkip(key: string, skip: boolean): void {
  try {
    if (skip) localStorage.setItem(CONFIRM_SKIP_PREFIX + key, '1')
    else localStorage.removeItem(CONFIRM_SKIP_PREFIX + key)
  } catch {
    /* ignore */
  }
}

// ---- per-kind share section defaults --------------------------------------

/** The entity kinds that can be shared with players (and carry share defaults). */
export const SHAREABLE_KINDS: ShareableKind[] = ['npc', 'location', 'note', 'session', 'item']

function shareDefaultsKey(kind: ShareableKind) {
  return `codex.shareDefaults.${kind}`
}

/** The DM's remembered "sections I usually share" for a kind, or null if unset. */
export function loadShareDefaults(kind: ShareableKind): string[] | null {
  try {
    const raw = localStorage.getItem(shareDefaultsKey(kind))
    return raw ? (JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

export function saveShareDefaults(kind: ShareableKind, keys: string[]): void {
  try {
    localStorage.setItem(shareDefaultsKey(kind), JSON.stringify(keys))
  } catch {
    /* ignore */
  }
}

export function clearShareDefaults(kind: ShareableKind): void {
  try {
    localStorage.removeItem(shareDefaultsKey(kind))
  } catch {
    /* ignore */
  }
}

/** Human label for a section key within a kind (falls back to the raw key). */
export function sectionLabel(kind: ShareableKind, key: string): string {
  return SECTIONS[kind].find((s) => s.key === key)?.label ?? key
}
