import { useEffect, useRef, useState } from 'react'

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void }
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }

const fsElement = (doc: FsDocument) => doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
function leaveFullscreen() {
  const doc = document as FsDocument
  if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {})
  else doc.webkitExitFullscreen?.()
}

/**
 * Full-screen mode for a page section: `expanded` drives an in-page overlay
 * (CSS), and entering also asks the browser for real full screen when allowed.
 * We fullscreen the whole document, not one element, so app dialogs (confirms,
 * side panels) still render on top. Esc exits: the browser handles it in real
 * full screen; in overlay-only mode we do, unless `escBusy()` says Esc belongs
 * to something else (e.g. an open side panel).
 */
export function useFullscreen(escBusy: () => boolean = () => false, startExpanded = false) {
  const [expanded, setExpanded] = useState(startExpanded)
  const usedApi = useRef(false)
  const busy = useRef(escBusy)
  busy.current = escBusy

  function enter() {
    setExpanded(true)
    // Real full screen where the browser offers it: desktop, Android Chrome, iPad Safari (the
    // webkit-prefixed form). iPhone Safari has neither, so there the in-page overlay is all we have.
    const el = document.documentElement as FsElement
    const doc = document as FsDocument
    if (fsElement(doc)) return
    try {
      const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.()
      if (p) {
        Promise.resolve(p)
          .then(() => {
            usedApi.current = true
          })
          .catch(() => {
            /* not allowed here: the in-page overlay still works */
          })
      } else if (el.webkitRequestFullscreen) {
        // The old prefixed form returns nothing; fullscreenchange tells us when it took.
        setTimeout(() => {
          if (fsElement(doc)) usedApi.current = true
        }, 300)
      }
    } catch {
      /* ignore */
    }
  }

  function exit() {
    setExpanded(false)
    if (usedApi.current && fsElement(document as FsDocument)) leaveFullscreen()
    usedApi.current = false
  }

  useEffect(() => {
    if (!expanded) return
    // The browser's own Esc leaves real full screen; follow it out.
    const onFsChange = () => {
      if (!fsElement(document as FsDocument) && usedApi.current) {
        usedApi.current = false
        setExpanded(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !usedApi.current && !busy.current()) setExpanded(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [expanded])

  // Leaving the page while expanded must not strand the browser in full screen.
  useEffect(
    () => () => {
      if (usedApi.current && fsElement(document as FsDocument)) leaveFullscreen()
    },
    [],
  )

  return { expanded, enter, exit }
}
