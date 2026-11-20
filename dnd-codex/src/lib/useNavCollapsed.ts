import { useState } from 'react'

/**
 * Remember a sidebar section's open/closed state per browser.
 *
 * `forceOpenInitially` opens the section on first render even when a stored
 * choice says closed, without changing what is stored. The returned `openNow`
 * does the same later (for example when the route moves into the section). Both
 * are transient: only `toggle` writes the stored choice.
 */
export function useNavCollapsed(key: string, defaultOpen: boolean, forceOpenInitially = false) {
  const storageKey = `codex.nav.${key}`
  const [open, setOpen] = useState(() => {
    if (forceOpenInitially) return true
    try {
      const v = localStorage.getItem(storageKey)
      return v == null ? defaultOpen : v === '1'
    } catch {
      return defaultOpen
    }
  })
  const toggle = () =>
    setOpen((o) => {
      const next = !o
      try {
        localStorage.setItem(storageKey, next ? '1' : '0')
      } catch {
        /* private mode / blocked storage — state just won't persist */
      }
      return next
    })
  const openNow = () => setOpen(true)
  return [open, toggle, openNow] as const
}
