import { useEffect, useState, type RefObject } from 'react'
import { useInspectorWindow } from '../components/battlemap/useInspectorWindow'
import { useMediaQuery } from './useMediaQuery'

/**
 * Where a side panel sits: docked beside the map (it reserves width), floating over the map,
 * in its own window, or closed. The DM's Run Mode panel and the player's session panel share
 * this vocabulary and the Inspector shell (components/battlemap/Inspector.tsx).
 */
export type PanelMode = 'docked' | 'float' | 'window' | 'closed'

/** Narrow or short screens (a phone, in either orientation) keep the panel docked: no float, no pop-out, no close. */
export const COMPACT_PANEL_QUERY = '(max-width: 860px), (max-height: 500px)'

const FLOAT_KEY = 'codex.panel.float'

/**
 * Placement state for the player's session panel (T-112): open or closed, docked or floating,
 * and the pop-out window. One copy lives on the page and is shared with full screen.
 */
export function usePanelPlacement() {
  const compact = useMediaQuery(COMPACT_PANEL_QUERY)
  const [open, setOpen] = useState(true)
  const [float, setFloat] = useState(() => {
    try { return localStorage.getItem(FLOAT_KEY) === '1' } catch { return false }
  })
  const iw = useInspectorWindow('Session panel', 'dnd-codex-session-panel')
  const mode: PanelMode = compact ? 'docked' : iw.win ? 'window' : !open ? 'closed' : float ? 'float' : 'docked'

  function toggleFloat() {
    setFloat((f) => {
      try { localStorage.setItem(FLOAT_KEY, f ? '0' : '1') } catch { /* ignore */ }
      return !f
    })
  }
  /** The panel's own close button, and the rail button when the panel is open. */
  function close() {
    if (iw.win) iw.close()
    setOpen(!!iw.win)
  }
  /** The rail button: bring the panel back from its own window, or open and close it. */
  function toggle() {
    if (iw.win) {
      iw.close()
      setOpen(true)
    } else setOpen((o) => !o)
  }
  return {
    mode,
    compact,
    canFloat: !compact,
    canClose: !compact,
    /** True while the panel is on screen somewhere (docked, floating or in a window). */
    visible: compact || iw.win != null || open,
    iw,
    toggleFloat,
    close,
    toggle,
    openWindow: compact ? undefined : iw.open,
  }
}
export type PanelPlacement = ReturnType<typeof usePanelPlacement>

/**
 * The zoom, Fit and Ping bar sits at the bottom right of a map. A floating panel (or a drawer)
 * overlays the map, so measure how far it reaches in from the right edge and publish it as
 * --map-clear-right on the map element; the bar moves clear of it. Docked panels shrink the map
 * itself, so they need none. Shared by Run Mode and the player's session page.
 */
export function useMapClearRight(mapRef: RefObject<HTMLElement | null>, overlaying: boolean) {
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const overlay = () => (overlaying ? map.querySelector<HTMLElement>('[data-testid="bm-inspector"]') : null)
    const update = () => {
      const panel = overlay()
      let clear = 0
      if (panel) {
        const m = map.getBoundingClientRect()
        const r = panel.getBoundingClientRect()
        // Only a panel that reaches the bottom strip hides the bar; a panel over most of the map (a phone drawer) is modal.
        if (r.width > 0 && r.bottom > m.bottom - 72 && r.left < m.right) clear = Math.max(0, m.right - r.left)
        if (clear > m.width * 0.6) clear = 0
      }
      map.style.setProperty('--map-clear-right', `${Math.round(clear)}px`)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(map)
    const panel = overlay()
    if (panel) ro.observe(panel)
    const mo = new MutationObserver(update)
    if (panel) mo.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] })
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', update)
    }
  })
}
