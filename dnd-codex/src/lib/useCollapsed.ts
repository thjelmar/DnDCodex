import { useCallback, useSyncExternalStore } from 'react'

// Per-browser collapse state for a UI section, keyed by a stable string. Uses a
// tiny event so multiple sections re-render when any one toggles (and to stay in
// sync if the same key is used in two places). localStorage is best-effort.

const EVENT = 'codex:collapsed'

function read(key: string, defaultOpen: boolean): boolean {
  try {
    const v = localStorage.getItem(`codex.collapsed.${key}`)
    return v == null ? defaultOpen : v === '1'
  } catch {
    return defaultOpen
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

export function useCollapsed(key: string, defaultOpen = true): [boolean, () => void] {
  const open = useSyncExternalStore(
    subscribe,
    () => read(key, defaultOpen),
    () => defaultOpen,
  )
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(`codex.collapsed.${key}`, open ? '0' : '1')
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVENT))
  }, [key, open])
  return [open, toggle]
}
