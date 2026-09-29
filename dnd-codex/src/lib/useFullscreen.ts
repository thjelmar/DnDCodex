import { useEffect, useRef, useState } from 'react'

/**
 * Full-screen mode for a page section: `expanded` drives an in-page overlay
 * (CSS), and entering also asks the browser for real full screen when allowed.
 * We fullscreen the whole document, not one element, so app dialogs (confirms,
 * side panels) still render on top. Esc exits: the browser handles it in real
 * full screen; in overlay-only mode we do, unless `escBusy()` says Esc belongs
 * to something else (e.g. an open side panel).
 */
export function useFullscreen(escBusy: () => boolean = () => false) {
  const [expanded, setExpanded] = useState(false)
  const usedApi = useRef(false)
  const busy = useRef(escBusy)
  busy.current = escBusy

  function enter() {
    setExpanded(true)
    const el = document.documentElement
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen()
        .then(() => {
          usedApi.current = true
        })
        .catch(() => {
          /* not allowed here — the in-page overlay still works */
        })
    }
  }

  function exit() {
    setExpanded(false)
    if (usedApi.current && document.fullscreenElement) document.exitFullscreen().catch(() => {})
    usedApi.current = false
  }

  useEffect(() => {
    if (!expanded) return
    // The browser's own Esc leaves real full screen; follow it out.
    const onFsChange = () => {
      if (!document.fullscreenElement && usedApi.current) {
        usedApi.current = false
        setExpanded(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !usedApi.current && !busy.current()) setExpanded(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [expanded])

  // Leaving the page while expanded must not strand the browser in full screen.
  useEffect(
    () => () => {
      if (usedApi.current && document.fullscreenElement) document.exitFullscreen().catch(() => {})
    },
    [],
  )

  return { expanded, enter, exit }
}
