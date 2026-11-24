import { useEffect, useRef, type RefObject } from 'react'
import { CLICK_MAX_MS, DRAG_SLOP_PX, LONG_PRESS_MS, TOUCH_SLOP_PX } from '../lib/pings'
import type { PingsApi } from '../lib/usePings'

// Gesture recognizer for map pings (T-102). Native capture-phase listeners on the
// board, so Tabletop's own React handlers stay untouched. Right click (or Mac
// Ctrl+click, or a two-finger trackpad tap) pings; right-drag shows a cursor.
// On touch, a long press pings and long press then drag shows a cursor. The
// Ping tool turns any left press into a ping. A second finger, a pan, or a
// pointercancel cancels a long press, so pinch and pan keep working.

interface Opts {
  pings: PingsApi | undefined
  /** Client point to board point (uses the current pan and zoom). */
  toBoard: (clientX: number, clientY: number) => { x: number; y: number }
  /** A board tool (fog, measure, template, align) owns left presses. */
  blocked: boolean
  /** Abandon the press Tabletop already started (pan, token drag). */
  claim: () => void
  /** Board point at the middle of the viewport (keyboard ping). */
  center: () => { x: number; y: number }
}

type RightPress = { kind: 'right'; id: number; x: number; y: number; t: number; drag: boolean; ctrl: boolean }
type TouchPress = { kind: 'touch'; id: number; x: number; y: number; t: number; fired: boolean; drag: boolean; timer: number }
type Press = RightPress | TouchPress

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent)

export function useBoardPings(ref: RefObject<HTMLElement | null>, o: Opts) {
  const opts = useRef(o)
  opts.current = o
  const enabled = !!o.pings?.enabled

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let press: Press | null = null
    let lastClient: { x: number; y: number } | null = null
    let lastCursorAt = 0
    let pendingTimer = 0
    let pendingPoint: { x: number; y: number } | null = null

    const api = () => opts.current.pings!
    const board = (cx: number, cy: number) => opts.current.toBoard(cx, cy)
    const onToken = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('.tabletop-token')

    const sendCursor = (cx: number, cy: number, end: boolean) => {
      const p = board(cx, cy)
      const now = performance.now()
      if (end) {
        window.clearTimeout(pendingTimer)
        pendingTimer = 0
        pendingPoint = null
        lastCursorAt = 0
        api().sendCursor(p.x, p.y, true)
        return
      }
      const gap = api().cursorIntervalMs
      if (now - lastCursorAt >= gap) {
        lastCursorAt = now
        api().sendCursor(p.x, p.y, false)
      } else {
        // Coalesce: keep only the latest point and flush at the next tick.
        pendingPoint = p
        if (!pendingTimer) {
          pendingTimer = window.setTimeout(() => {
            pendingTimer = 0
            if (pendingPoint) {
              lastCursorAt = performance.now()
              api().sendCursor(pendingPoint.x, pendingPoint.y, false)
              pendingPoint = null
            }
          }, Math.max(0, gap - (now - lastCursorAt)))
        }
      }
    }

    const endPress = (e: PointerEvent, cancelled: boolean) => {
      const p = press
      if (!p) return
      press = null
      if (p.kind === 'touch') window.clearTimeout(p.timer)
      if (p.kind === 'touch' && !p.fired) return // a plain tap or a pan: not ours
      e.stopPropagation()
      if (p.drag) sendCursor(e.clientX, e.clientY, true)
      else if (!cancelled && (p.kind === 'touch' || performance.now() - p.t <= CLICK_MAX_MS)) {
        const b = board(e.clientX, e.clientY)
        api().sendPing(b.x, b.y)
      }
    }

    const onDown = (e: PointerEvent) => {
      const a = api()
      lastClient = { x: e.clientX, y: e.clientY }
      if (press && press.kind === 'touch' && !e.isPrimary) {
        window.clearTimeout(press.timer) // a second finger: pinch wins
        press = null
        return
      }
      const right = e.pointerType !== 'touch' && e.button === 2
      const ctrl = isMac && e.pointerType === 'mouse' && e.button === 0 && e.ctrlKey && !opts.current.blocked
      if (right || ctrl) {
        if (ctrl) e.stopPropagation() // keep Ctrl+click from panning or dragging a token
        press = { kind: 'right', id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), drag: false, ctrl }
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          /* the pointer is gone */
        }
        return
      }
      if (e.button !== 0) return
      if (a.pingTool) {
        // Ping tool: any left press pings and never pans.
        e.stopPropagation()
        const b = board(e.clientX, e.clientY)
        a.sendPing(b.x, b.y)
        return
      }
      if (e.pointerType === 'touch' && e.isPrimary && !opts.current.blocked && !onToken(e.target)) {
        const t: TouchPress = {
          kind: 'touch',
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          t: performance.now(),
          fired: false,
          drag: false,
          timer: window.setTimeout(() => {
            if (press !== t) return
            t.fired = true
            opts.current.claim() // drop the pan this press started
            try {
              navigator.vibrate?.(10)
            } catch {
              /* unsupported */
            }
          }, LONG_PRESS_MS),
        }
        press = t
      }
    }

    const onMove = (e: PointerEvent) => {
      lastClient = { x: e.clientX, y: e.clientY }
      const p = press
      if (!p || p.id !== e.pointerId) return
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y)
      if (p.kind === 'right') {
        if (!p.ctrl && !(e.buttons & 2)) {
          press = null // a lost pointerup (a menu opened): end any cursor
          if (p.drag) sendCursor(e.clientX, e.clientY, true)
          return
        }
        if (p.ctrl) e.stopPropagation()
        if (!p.drag && dist > DRAG_SLOP_PX) p.drag = true
        if (p.drag) sendCursor(e.clientX, e.clientY, false)
        return
      }
      if (!p.fired) {
        if (dist > TOUCH_SLOP_PX) {
          window.clearTimeout(p.timer) // a pan
          press = null
        }
        return
      }
      e.stopPropagation()
      if (!p.drag && dist > TOUCH_SLOP_PX) p.drag = true
      if (p.drag) sendCursor(e.clientX, e.clientY, false)
    }

    const onUp = (e: PointerEvent) => {
      if (press && press.id === e.pointerId) endPress(e, false)
    }
    const onCancel = (e: PointerEvent) => {
      if (press && press.id === e.pointerId) endPress(e, true)
    }
    const onContext = (e: Event) => e.preventDefault()
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'p' && e.key !== 'P') || e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const r = el.getBoundingClientRect()
      const inside = lastClient && lastClient.x >= r.left && lastClient.x <= r.right && lastClient.y >= r.top && lastClient.y <= r.bottom
      const b = inside ? board(lastClient!.x, lastClient!.y) : opts.current.center()
      api().sendPing(b.x, b.y)
    }

    el.addEventListener('pointerdown', onDown, true)
    el.addEventListener('pointermove', onMove, true)
    el.addEventListener('pointerup', onUp, true)
    el.addEventListener('pointercancel', onCancel, true)
    el.addEventListener('contextmenu', onContext, true)
    el.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(pendingTimer)
      if (press?.kind === 'touch') window.clearTimeout(press.timer)
      el.removeEventListener('pointerdown', onDown, true)
      el.removeEventListener('pointermove', onMove, true)
      el.removeEventListener('pointerup', onUp, true)
      el.removeEventListener('pointercancel', onCancel, true)
      el.removeEventListener('contextmenu', onContext, true)
      el.removeEventListener('keydown', onKey)
    }
  }, [ref, enabled])
}
