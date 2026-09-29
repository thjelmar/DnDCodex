import { useEffect, useState } from 'react'
import { LATEST_CHANGELOG_DATE } from '../data/changelog'

// Tracks whether this browser has seen the newest changelog entry. Stored
// per-browser in localStorage (like other local UI state) — nothing synced.

const KEY = 'codex.changelogSeen'
const EVENT = 'codex:changelog-seen'

function getSeen(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/** Record that the visitor has viewed the changelog up to the latest entry. */
export function markChangelogSeen(): void {
  try {
    if (localStorage.getItem(KEY) === LATEST_CHANGELOG_DATE) return
    localStorage.setItem(KEY, LATEST_CHANGELOG_DATE)
  } catch {
    /* private mode / blocked storage — the dot just won't persist */
  }
  window.dispatchEvent(new Event(EVENT))
}

/** True when there's a changelog entry newer than what this browser has seen. */
export function useChangelogUnseen(): boolean {
  const [seen, setSeen] = useState(getSeen)
  useEffect(() => {
    const refresh = () => setSeen(getSeen())
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  return !!LATEST_CHANGELOG_DATE && seen !== LATEST_CHANGELOG_DATE
}
