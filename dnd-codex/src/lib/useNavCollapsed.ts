import { useState } from 'react'

/** Remember a sidebar section's open/closed state per browser. */
export function useNavCollapsed(key: string, defaultOpen: boolean) {
  const storageKey = `codex.nav.${key}`
  const [open, setOpen] = useState(() => {
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
  return [open, toggle] as const
}
