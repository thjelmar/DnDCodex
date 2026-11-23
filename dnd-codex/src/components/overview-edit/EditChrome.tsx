import { useEffect, useRef, useState } from 'react'
import { cancelActiveDrag, startMoveDrag, startResizeDrag } from './pointerDrag'
import { Icon } from '../Icon'
import { cardDef, type CardId, type ResolvedLayout, type Span } from '../../lib/overviewCards'
import { addCard, hideCard, moveCard, spansFor, stepSpan } from './ops'

// Everything that exists only while the Overview is in edit mode (T-89), loaded lazily:
// the edit bar with the tray of hidden cards, and the per-card toolbar. The page owns the
// layout state; these components call onChange with the next layout and the page saves it.
// No control here uses aria-expanded, because the Overview's collapse styles look for it.

const SPAN_LABEL: Record<Span, string> = { 4: 'one third width', 6: 'half width', 8: 'two thirds width', 12: 'full width' }

// A tiny module-level channel, so the bar and the toolbars (separate lazy components)
// share one live region and one "focus this control after the layout re-renders" request.
let pendingFocus: string | null = null
const listeners = new Set<(msg: string) => void>()
function say(msg: string): void {
  listeners.forEach((f) => f(msg))
}

const title = (id: CardId) => cardDef(id)?.title ?? id

export function EditBar({
  layout,
  wide,
  onChange,
  onReset,
  onDone,
}: {
  layout: ResolvedLayout
  wide: boolean
  onChange: (next: ResolvedLayout) => void
  onReset: () => void
  onDone: () => void
}) {
  const [trayOpen, setTrayOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [undo, setUndo] = useState<ResolvedLayout | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const empty = layout.cards.length === 0
  const open = trayOpen || empty

  useEffect(() => {
    headingRef.current?.focus()
    const onSay = (m: string) => setMessage(m)
    listeners.add(onSay)
    return () => {
      listeners.delete(onSay)
      cancelActiveDrag() // leaving edit mode ends any drag still in progress
      if (undoTimer.current) clearTimeout(undoTimer.current)
    }
  }, [])

  // After any edit the cards re-render in their new order, which can drop focus; put it
  // back on the control the user was using.
  useEffect(() => {
    if (!pendingFocus) return
    const el = document.querySelector<HTMLElement>(`[data-edit-focus="${pendingFocus}"]`)
    pendingFocus = null
    el?.focus()
  }, [layout])

  function add(id: CardId) {
    onChange(addCard(layout, id))
    pendingFocus = `${id}:earlier`
    say(`${title(id)} added at the end. ${layout.hidden.length - 1} hidden.`)
  }

  function reset() {
    setUndo(layout)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndo(null), 10_000)
    onReset()
    say('Layout reset to the default.')
  }

  function undoReset() {
    if (!undo) return
    onChange(undo)
    setUndo(null)
    say('Reset undone. Your layout is back.')
  }

  return (
    <section className="ov-edit-bar" aria-labelledby="ov-edit-title">
      <div className="ov-edit-bar-row">
        <div className="ov-edit-bar-text">
          <h2 id="ov-edit-title" className="ov-edit-title" tabIndex={-1} ref={headingRef}>
            Editing layout
          </h2>
          <p className="ov-edit-help">
            {wide
              ? 'Move cards earlier or later, change their width, or hide them. Changes save as you go.'
              : 'Move cards earlier or later, or hide them. Widths apply on screens wider than 960 px. Changes save as you go.'}
          </p>
        </div>
        <div className="ov-edit-bar-actions">
          <button
            type="button"
            className="btn small"
            data-edit-focus="bar:add"
            aria-expanded={open}
            aria-controls="ov-edit-tray"
            onClick={() => setTrayOpen((o) => !o)}
          >
            <Icon name="plus" size={13} /> Add card{layout.hidden.length ? ` (${layout.hidden.length})` : ''}
          </button>
          <button type="button" className="btn small" onClick={reset}>
            Reset layout
          </button>
          <button type="button" className="btn small primary" onClick={onDone}>
            <Icon name="check" size={13} color="currentColor" /> Done
          </button>
        </div>
      </div>

      {undo && (
        <p className="ov-edit-undo" role="status">
          Layout reset to the default.{' '}
          <button type="button" className="linklike" onClick={undoReset}>
            Undo
          </button>
        </p>
      )}

      <div id="ov-edit-tray" className="ov-edit-tray" hidden={!open}>
        {empty && <p className="ov-edit-empty">Every card is hidden. Add one back, or reset the layout.</p>}
        {layout.hidden.length === 0 ? (
          <p className="ov-edit-help">No hidden cards. Use Hide on a card to move it here.</p>
        ) : (
          <ul className="ov-edit-tray-list">
            {layout.hidden.map((id) => (
              <li key={id} className="ov-edit-tray-item">
                <div>
                  <strong>{title(id)}</strong>
                  <span className="ov-edit-help">{cardDef(id)?.blurb}</span>
                </div>
                <button type="button" className="btn small" onClick={() => add(id)} aria-label={`Add ${title(id)} back`}>
                  <Icon name="plus" size={13} /> Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {message}
      </div>
    </section>
  )
}

export function CardToolbar({
  id,
  layout,
  wide,
  onChange,
}: {
  id: CardId
  layout: ResolvedLayout
  wide: boolean
  onChange: (next: ResolvedLayout) => void
}) {
  const index = layout.cards.findIndex((c) => c.id === id)
  if (index < 0) return null
  const count = layout.cards.length
  const span = layout.cards[index].span
  const allowed = spansFor(id)
  const name = title(id)
  // The drag handlers outlive a render, so they read the layout through a ref.
  const latest = useRef({ layout, onChange })
  latest.current = { layout, onChange }

  const startDrag = (e: React.PointerEvent<HTMLElement>, kind: 'move' | 'resize') => {
    if (e.button !== 0 || !e.isPrimary) return
    e.preventDefault() // no text selection or focus ring flash while dragging
    const common = {
      event: e.nativeEvent,
      handle: e.currentTarget,
      id,
      getLayout: () => latest.current.layout,
      onChange: (next: ResolvedLayout) => latest.current.onChange(next),
      announce: say,
    }
    if (kind === 'move') {
      startMoveDrag({ ...common, onMoved: () => (pendingFocus = `${id}:drag`) })
    } else {
      startResizeDrag({ ...common, onResized: () => (pendingFocus = `${id}:resize`) })
    }
  }

  function move(to: Parameters<typeof moveCard>[2], kind: 'earlier' | 'later', focus: string = kind) {
    const next = moveCard(layout, id, to)
    if (next === layout) {
      say(`${name} is already ${kind === 'earlier' ? 'first' : 'last'}.`)
      return
    }
    pendingFocus = `${id}:${focus}`
    onChange(next)
    say(`${name} moved to position ${next.cards.findIndex((c) => c.id === id) + 1} of ${count}.`)
  }

  function width(dir: -1 | 1, kind: 'narrower' | 'wider', focus: string = kind) {
    const next = stepSpan(layout, id, dir)
    if (next === layout) {
      say(`${name} is already ${dir < 0 ? 'at its narrowest' : 'full width'}.`)
      return
    }
    pendingFocus = `${id}:${focus}`
    onChange(next)
    say(`${name} is now ${SPAN_LABEL[next.cards[index].span]}.`)
  }

  function hide() {
    const neighbour = layout.cards[index + 1] ?? layout.cards[index - 1]
    pendingFocus = neighbour ? `${neighbour.id}:earlier` : 'bar:add'
    onChange(hideCard(layout, id))
    say(`${name} hidden. ${layout.hidden.length + 1} hidden.`)
  }

  // `focus` is the control that keeps focus after the edit: the one the key was pressed on.
  const moveKeys = (focus?: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move({ by: -1 }, 'earlier', focus)
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move({ by: 1 }, 'later', focus)
    else if (e.key === 'Home') move('first', 'earlier', focus)
    else if (e.key === 'End') move('last', 'later', focus)
    else return
    e.preventDefault()
  }
  const widthKeys = (focus?: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') width(-1, 'narrower', focus)
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') width(1, 'wider', focus)
    else return
    e.preventDefault()
  }

  return (
    <>
    <div className="ov-edit-toolbar" role="group" aria-label={`${name} layout controls`}>
      {wide && (
        <button
          type="button"
          className="ov-edit-grip"
          tabIndex={-1}
          data-edit-focus={`${id}:drag`}
          aria-label={`Drag ${name} to a new place. With the handle focused, arrow keys move it.`}
          onPointerDown={(e) => startDrag(e, 'move')}
          onKeyDown={moveKeys('drag')}
        >
          <Icon name="menu" size={14} color="currentColor" />
        </button>
      )}
      <span className="ov-edit-toolbar-name" aria-hidden>
        {name}
      </span>
      <div className="ov-edit-toolbar-actions">
        <button
          type="button"
          className="ov-edit-btn"
          data-edit-focus={`${id}:earlier`}
          aria-disabled={index === 0}
          aria-label={`Move ${name} earlier, position ${index + 1} of ${count}`}
          onClick={() => move({ by: -1 }, 'earlier')}
          onKeyDown={moveKeys()}
        >
          <Icon name="chevron-left" size={14} color="currentColor" />
          <span className="ov-edit-btn-text">Earlier</span>
        </button>
        <button
          type="button"
          className="ov-edit-btn"
          data-edit-focus={`${id}:later`}
          aria-disabled={index === count - 1}
          aria-label={`Move ${name} later, position ${index + 1} of ${count}`}
          onClick={() => move({ by: 1 }, 'later')}
          onKeyDown={moveKeys()}
        >
          <span className="ov-edit-btn-text">Later</span>
          <Icon name="chevron-right" size={14} color="currentColor" />
        </button>
        {wide && (
          <>
            <button
              type="button"
              className="ov-edit-btn"
              data-edit-focus={`${id}:narrower`}
              aria-disabled={span === allowed[0]}
              aria-label={`Make ${name} narrower, now ${SPAN_LABEL[span]}`}
              onClick={() => width(-1, 'narrower')}
              onKeyDown={widthKeys()}
            >
              <span className="ov-edit-btn-text">Narrower</span>
            </button>
            <button
              type="button"
              className="ov-edit-btn"
              data-edit-focus={`${id}:wider`}
              aria-disabled={span === 12}
              aria-label={`Make ${name} wider, now ${SPAN_LABEL[span]}`}
              onClick={() => width(1, 'wider')}
              onKeyDown={widthKeys()}
            >
              <span className="ov-edit-btn-text">Wider</span>
            </button>
          </>
        )}
        <button type="button" className="ov-edit-btn danger" aria-label={`Hide ${name}`} onClick={hide}>
          <Icon name="eye-off" size={14} color="currentColor" />
          <span className="ov-edit-btn-text">Hide</span>
        </button>
      </div>
    </div>
    {wide && (
      <button
        type="button"
        className="ov-resize-handle"
        tabIndex={-1}
        data-edit-focus={`${id}:resize`}
        aria-label={`Resize ${name}, now ${SPAN_LABEL[span]}. Drag the edge, or use arrow keys.`}
        onPointerDown={(e) => startDrag(e, 'resize')}
        onKeyDown={widthKeys('resize')}
      />
    )}
    </>
  )
}
