import type { CardId, ResolvedLayout, Span } from '../../lib/overviewCards'
import { cardDef } from '../../lib/overviewCards'
import { columnWidth, dropTarget, indicatorBox, snapSpan, type CellRect, type DropTarget } from './dragMath'
import { moveCard, setSpan, spansFor } from './ops'

// Pointer drag for the Overview edit mode (T-90): drag a card to a new place, or drag its
// right edge to change its width. Hand-written on pointer events (no dependency). The
// buttons and arrow keys stay the primary, accessible path; this only adds direct
// manipulation. Every drag ends through one function, finish(), whatever stops it: the
// pointer going up, the browser cancelling it, losing capture, Escape, the window losing
// focus or the page hiding, so a drag can never leave the page stuck.

const SPAN_LABEL: Record<Span, string> = { 4: 'one third', 6: 'half', 8: 'two thirds', 12: 'full width' }

interface Hooks {
  move(x: number, y: number): void
  commit(x: number, y: number): void
  cancel(): void
}

let active: { cancel: () => void } | null = null

/** Ends any drag in progress without applying it (used when edit mode closes). */
export function cancelActiveDrag(): void {
  active?.cancel()
}

function scrollParent(el: Element | null): HTMLElement {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement
}

function begin(handle: HTMLElement, e: PointerEvent, hooks: Hooks, scroller: HTMLElement): void {
  cancelActiveDrag()
  let px = e.clientX
  let py = e.clientY
  let raf = 0
  let done = false
  try {
    handle.setPointerCapture(e.pointerId)
  } catch {
    /* a pointer that is already gone: the next event ends the drag */
  }
  document.body.classList.add('ov-dragging')

  const EDGE = 64
  const tick = () => {
    raf = 0
    if (done) return
    // Scroll the page when the pointer is near its top or bottom edge, then re-measure.
    const r = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect()
    let dy = 0
    if (py < r.top + EDGE) dy = -Math.ceil(((r.top + EDGE - py) / EDGE) * 18)
    else if (py > r.bottom - EDGE) dy = Math.ceil(((py - (r.bottom - EDGE)) / EDGE) * 18)
    if (dy) scroller.scrollBy(0, dy)
    hooks.move(px, py)
    if (dy) raf = requestAnimationFrame(tick)
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(tick)
  }

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    px = ev.clientX
    py = ev.clientY
    schedule()
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId === e.pointerId) finish(true)
  }
  const onCancel = (ev: PointerEvent) => {
    if (ev.pointerId === e.pointerId) finish(false)
  }
  // Capture can be lost on its own (the handle is removed, the browser takes the pointer).
  // Some engines report that before the pointerup of the same gesture, so wait a task: a
  // pointerup that is coming still commits, and anything else ends the drag as cancelled.
  const onLost = (ev: PointerEvent) => {
    if (ev.pointerId === e.pointerId) setTimeout(() => finish(false), 0)
  }
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      ev.stopPropagation()
      finish(false)
    }
  }
  const onHide = () => finish(false)
  const onVis = () => {
    if (document.hidden) finish(false)
  }

  function finish(commit: boolean) {
    if (done) return
    done = true
    if (raf) cancelAnimationFrame(raf)
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onCancel)
    handle.removeEventListener('lostpointercapture', onLost)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('blur', onHide)
    document.removeEventListener('visibilitychange', onVis)
    try {
      handle.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    document.body.classList.remove('ov-dragging')
    active = null
    if (commit) hooks.commit(px, py)
    else hooks.cancel()
  }

  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onCancel)
  handle.addEventListener('lostpointercapture', onLost)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('blur', onHide)
  document.addEventListener('visibilitychange', onVis)
  active = { cancel: () => finish(false) }
  hooks.move(px, py)
}

const el = (cls: string, text?: string) => {
  const d = document.createElement('div')
  d.className = cls
  if (text) d.textContent = text
  document.body.appendChild(d)
  return d
}

function cellsOf(grid: Element, exceptId: string): { rects: CellRect[]; self: HTMLElement | null } {
  const rects: CellRect[] = []
  let self: HTMLElement | null = null
  grid.querySelectorAll<HTMLElement>(':scope > .ov-cell[data-card-id]').forEach((c) => {
    const id = c.dataset.cardId!
    if (id === exceptId) {
      self = c
      return
    }
    const r = c.getBoundingClientRect()
    rects.push({ id, x: r.x, y: r.y, w: r.width, h: r.height })
  })
  return { rects, self }
}

export interface MoveDragArgs {
  event: PointerEvent
  handle: HTMLElement
  id: CardId
  getLayout: () => ResolvedLayout
  onChange: (next: ResolvedLayout) => void
  announce: (message: string) => void
  onMoved: () => void
}

/** Drag a card to a new place in the reading order. */
export function startMoveDrag(a: MoveDragArgs): void {
  const cell = a.handle.closest<HTMLElement>('.ov-cell')
  const grid = cell?.parentElement
  if (!cell || !grid) return
  const name = cardDef(a.id)?.title ?? a.id
  const ghost = el('ov-drag-ghost', `Moving ${name}`)
  const bar = el('ov-drop-indicator')
  cell.classList.add('is-dragging')
  let target: DropTarget | null = null

  const cleanup = () => {
    ghost.remove()
    bar.remove()
    cell.classList.remove('is-dragging')
  }
  begin(
    a.handle,
    a.event,
    {
      move(x, y) {
        ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`
        const gr = grid.getBoundingClientRect()
        const { rects } = cellsOf(grid, a.id)
        target = dropTarget(rects, x, y, gr.width)
        const ref = rects.find((r) => r.id === target!.refId)
        if (!ref) {
          bar.style.display = 'none'
          return
        }
        const b = indicatorBox(ref, target)
        bar.style.display = 'block'
        bar.style.transform = `translate(${b.x}px, ${b.y}px)`
        bar.style.width = `${b.w}px`
        bar.style.height = `${b.h}px`
      },
      commit() {
        cleanup()
        const layout = a.getLayout()
        const from = layout.cards.findIndex((c) => c.id === a.id)
        if (!target || from < 0 || target.index === from) return
        const next = moveCard(layout, a.id, target.index)
        if (next === layout) return
        a.onMoved()
        a.onChange(next)
        a.announce(`${name} moved to position ${next.cards.findIndex((c) => c.id === a.id) + 1} of ${next.cards.length}.`)
      },
      cancel() {
        cleanup()
        a.announce(`Move cancelled. ${name} stays where it was.`)
      },
    },
    scrollParent(grid),
  )
}

export interface ResizeDragArgs {
  event: PointerEvent
  handle: HTMLElement
  id: CardId
  getLayout: () => ResolvedLayout
  onChange: (next: ResolvedLayout) => void
  announce: (message: string) => void
  onResized: () => void
}

/** Drag a card's right edge to change its width; snaps to the allowed steps. */
export function startResizeDrag(a: ResizeDragArgs): void {
  const cell = a.handle.closest<HTMLElement>('.ov-cell')
  const grid = cell?.parentElement
  if (!cell || !grid) return
  const name = cardDef(a.id)?.title ?? a.id
  const allowed = spansFor(a.id)
  const original = cell.style.getPropertyValue('--span')
  const startSpan = Number(a.getLayout().cards.find((c) => c.id === a.id)?.span ?? original)
  const gap = parseFloat(getComputedStyle(grid).columnGap) || 14
  const colW = columnWidth(grid.getBoundingClientRect().width, gap)
  const badge = el('ov-drag-ghost')
  cell.classList.add('is-resizing')
  let current: Span = startSpan as Span

  const cleanup = () => {
    badge.remove()
    cell.classList.remove('is-resizing')
  }
  begin(
    a.handle,
    a.event,
    {
      move(x, y) {
        // The card's left edge does not move while its width changes, so measure from it.
        const left = cell.getBoundingClientRect().left
        const next = snapSpan(x - left, colW, gap, allowed)
        if (next !== current) {
          current = next
          cell.style.setProperty('--span', String(next))
        }
        badge.textContent = `${name}: ${SPAN_LABEL[current]}`
        badge.style.transform = `translate(${x + 14}px, ${y + 14}px)`
      },
      commit() {
        cleanup()
        const layout = a.getLayout()
        const next = setSpan(layout, a.id, current)
        if (next === layout) {
          cell.style.setProperty('--span', original)
          return
        }
        a.onResized()
        a.onChange(next)
        a.announce(`${name} is now ${SPAN_LABEL[current]}.`)
      },
      cancel() {
        cleanup()
        cell.style.setProperty('--span', original)
        a.announce(`Resize cancelled. ${name} keeps its width.`)
      },
    },
    scrollParent(grid),
  )
}
