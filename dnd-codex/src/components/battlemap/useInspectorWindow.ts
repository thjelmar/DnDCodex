import { useCallback, useEffect, useRef, useState } from 'react'

/** The Document Picture-in-Picture API (Chrome and Edge 116 and later). */
interface DocumentPip {
  requestWindow(opts?: { width?: number; height?: number }): Promise<Window>
}

export const WINDOW_BLOCKED = 'The browser blocked the new window. Allow pop-ups for this site, then try again.'

/**
 * Opens the scene inspector in its own window. Prefers Document
 * Picture-in-Picture, whose window stays on top of other windows. Everywhere
 * else it falls back to a normal popup, which a browser cannot keep on top.
 *
 * The caller renders the inspector into `win.document.body` with a React
 * portal, so the window shows the same live state as the page: nothing is
 * copied by hand. Closing the window clears `win`, and the caller docks the
 * inspector again. Call `open` from a click: both APIs need a user gesture.
 */
export function useInspectorWindow(title = 'Scene inspector', name = 'dnd-codex-inspector') {
  const [win, setWin] = useState<Window | null>(null)
  const [onTop, setOnTop] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = useRef<Window | null>(null)

  const open = useCallback(async () => {
    if (current.current && !current.current.closed) {
      current.current.focus()
      return
    }
    setError(null)
    let w: Window | null = null
    let top = false
    const pip = (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture
    if (pip?.requestWindow) {
      try {
        w = await pip.requestWindow({ width: 340, height: 620 })
        top = true
      } catch {
        w = null
      }
    }
    if (!w) {
      w = window.open('', name, 'popup,width=340,height=640')
      if (w) {
        w.document.open()
        w.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>')
        w.document.close()
      }
    }
    if (!w) {
      setError(WINDOW_BLOCKED)
      return
    }
    prepareWindow(w, title)
    current.current = w
    setOnTop(top)
    setWin(w)
    // A stale-closed window (the user closed it before this ran) docks again.
    const onHide = () => {
      if (current.current === w) {
        current.current = null
        setWin(null)
      }
    }
    w.addEventListener('pagehide', onHide)
  }, [title, name])

  const close = useCallback(() => {
    current.current?.close()
  }, [])

  // Leaving the page closes the window with it.
  useEffect(
    () => () => {
      current.current?.close()
      current.current = null
    },
    [],
  )

  return { win, onTop, error, clearError: () => setError(null), open, close }
}

/** Gives a new window the page's styles, theme and accent, and keeps the theme
 *  and accent (attributes on `<html>`) in sync while the window is open. */
function prepareWindow(w: Window, title: string): void {
  const src = document
  const dst = w.document
  dst.title = title
  const copyRoot = () => {
    for (const a of Array.from(src.documentElement.attributes)) dst.documentElement.setAttribute(a.name, a.value)
  }
  copyRoot()
  for (const node of Array.from(src.querySelectorAll('link[rel="stylesheet"], style'))) {
    const copy = node.cloneNode(true) as HTMLElement
    if (copy instanceof HTMLLinkElement) copy.href = (node as HTMLLinkElement).href
    dst.head.appendChild(copy)
  }
  dst.body.className = 'bm-window-body'
  const mo = new MutationObserver(copyRoot)
  mo.observe(src.documentElement, { attributes: true })
  w.addEventListener('pagehide', () => mo.disconnect())
}
