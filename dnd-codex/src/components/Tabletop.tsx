import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { SceneGrid, SceneToken } from '../db/types'
import {
  cellToPx,
  clampZoom,
  gridFromBox,
  initials,
  snapCenterToCell,
  tokenCenter,
} from '../lib/tabletop'

// The battle-map board: an SVG viewport with pan (drag the background), zoom
// (wheel, around the cursor), a map image, a calibratable square grid, and
// draggable tokens that snap to cells on drop. Controlled: the parent owns the
// scene and persists changes.

type Drag =
  | { kind: 'pan'; startX: number; startY: number; tx: number; ty: number }
  | { kind: 'token'; id: string; dx: number; dy: number; moved: boolean }
  | { kind: 'align'; x1: number; y1: number }

interface Props {
  width: number
  height: number
  grid: SceneGrid
  tokens: SceneToken[]
  mapUrl: string | null
  /** Portrait data URLs by StoredImage id. */
  portraits: Record<string, string>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMoveToken: (id: string, col: number, row: number) => void
  onDeleteToken: (id: string) => void
  onOpenToken: (token: SceneToken) => void
  /** When true, dragging draws a box around one map square to set the grid. */
  aligning: boolean
  onAlign: (grid: SceneGrid) => void
  /** Kept up to date with the board point at the center of the viewport. */
  centerRef?: MutableRefObject<{ x: number; y: number }>
}

export function Tabletop({
  width,
  height,
  grid,
  tokens,
  mapUrl,
  portraits,
  selectedId,
  onSelect,
  onMoveToken,
  onDeleteToken,
  onOpenToken,
  aligning,
  onAlign,
  centerRef,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState({ k: 1, tx: 0, ty: 0 })
  const drag = useRef<Drag | null>(null)
  // Live position of a token being dragged (board px, center) and the align box.
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [box, setBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  const toBoard = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left - transform.tx) / transform.k,
      y: (clientY - rect.top - transform.ty) / transform.k,
    }
  }

  function fit() {
    const el = wrapRef.current
    if (!el) return
    const { clientWidth: w, clientHeight: h } = el
    const k = clampZoom(Math.min(w / width, h / height) * 0.95)
    setTransform({ k, tx: (w - width * k) / 2, ty: (h - height * k) / 2 })
  }
  // Fit the whole board on first render and whenever the board size changes.
  useEffect(fit, [width, height]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !centerRef) return
    centerRef.current = {
      x: (el.clientWidth / 2 - transform.tx) / transform.k,
      y: (el.clientHeight / 2 - transform.ty) / transform.k,
    }
  }, [transform, centerRef])

  // Wheel zoom needs a non-passive listener so preventDefault stops page scroll.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = Math.exp(-e.deltaY * 0.0015)
      setTransform((t) => {
        const k = clampZoom(t.k * factor)
        return { k, tx: mx - ((mx - t.tx) / t.k) * k, ty: my - ((my - t.ty) / t.k) * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function zoomBy(f: number) {
    const el = wrapRef.current
    if (!el) return
    const mx = el.clientWidth / 2
    const my = el.clientHeight / 2
    setTransform((t) => {
      const k = clampZoom(t.k * f)
      return { k, tx: mx - ((mx - t.tx) / t.k) * k, ty: my - ((my - t.ty) / t.k) * k }
    })
  }

  function onBgPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    wrapRef.current?.focus()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    if (aligning) {
      const p = toBoard(e.clientX, e.clientY)
      drag.current = { kind: 'align', x1: p.x, y1: p.y }
      setBox({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
      return
    }
    drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, tx: transform.tx, ty: transform.ty }
  }

  function onTokenPointerDown(e: React.PointerEvent, t: SceneToken) {
    if (e.button !== 0 || aligning) return
    e.stopPropagation()
    wrapRef.current?.focus()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const c = tokenCenter(grid, t)
    const p = toBoard(e.clientX, e.clientY)
    drag.current = { kind: 'token', id: t.id, dx: c.x - p.x, dy: c.y - p.y, moved: false }
    onSelect(t.id)
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') {
      setTransform((t) => ({ ...t, tx: d.tx + (e.clientX - d.startX), ty: d.ty + (e.clientY - d.startY) }))
    } else if (d.kind === 'token') {
      const p = toBoard(e.clientX, e.clientY)
      d.moved = true
      setDragPos({ id: d.id, x: p.x + d.dx, y: p.y + d.dy })
    } else {
      const p = toBoard(e.clientX, e.clientY)
      setBox({ x1: d.x1, y1: d.y1, x2: p.x, y2: p.y })
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'pan') {
      // A click (not a pan) on empty board clears the selection.
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) onSelect(null)
    } else if (d.kind === 'token') {
      const t = tokens.find((x) => x.id === d.id)
      if (t && d.moved && dragPos && dragPos.id === d.id) {
        const cell = snapCenterToCell(grid, dragPos.x, dragPos.y, t.size)
        if (cell.col !== t.col || cell.row !== t.row) onMoveToken(t.id, cell.col, cell.row)
      }
      setDragPos(null)
    } else if (box) {
      const g = gridFromBox(grid, box.x1, box.y1, box.x2, box.y2)
      setBox(null)
      if (g) onAlign(g)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const t = tokens.find((x) => x.id === selectedId)
    if (!t) return
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    if (moves[e.key]) {
      e.preventDefault()
      const [dc, dr] = moves[e.key]
      onMoveToken(t.id, t.col + dc, t.row + dr)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onDeleteToken(t.id)
    } else if (e.key === 'Escape') {
      onSelect(null)
    } else if (e.key === 'Enter') {
      onOpenToken(t)
    }
  }

  const gridPath = `M ${grid.cellPx} 0 L 0 0 0 ${grid.cellPx}`
  // Draw selected + dragged tokens last so they sit on top.
  const ordered = [...tokens].sort(
    (a, b) => Number(a.id === selectedId || a.id === dragPos?.id) - Number(b.id === selectedId || b.id === dragPos?.id),
  )

  return (
    <div className="tabletop">
      <div
        ref={wrapRef}
        className={`tabletop-view${aligning ? ' aligning' : ''}`}
        tabIndex={0}
        onPointerDown={onBgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        aria-label="Battle map board"
      >
        <svg width="100%" height="100%">
          <defs>
            <pattern
              id="tt-grid"
              patternUnits="userSpaceOnUse"
              width={grid.cellPx}
              height={grid.cellPx}
              x={grid.offsetX}
              y={grid.offsetY}
            >
              <path d={gridPath} fill="none" stroke={grid.color} strokeOpacity={0.45} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </pattern>
          </defs>
          <g transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.k})`}>
            <rect x={0} y={0} width={width} height={height} className="tabletop-board" />
            {mapUrl && <image href={mapUrl} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />}
            {grid.show && <rect x={0} y={0} width={width} height={height} fill="url(#tt-grid)" pointerEvents="none" />}

            {ordered.map((t) => {
              const live = dragPos?.id === t.id ? dragPos : null
              const c = live ?? tokenCenter(grid, t)
              const r = (t.size * grid.cellPx) / 2 - Math.max(1.5, grid.cellPx * 0.05)
              const portrait = t.imageId ? portraits[t.imageId] : undefined
              const sel = t.id === selectedId
              // Ghost of the snap target while dragging.
              const snap = live ? snapCenterToCell(grid, live.x, live.y, t.size) : null
              const snapPx = snap ? cellToPx(grid, snap.col, snap.row) : null
              return (
                <g key={t.id}>
                  {snapPx && (
                    <rect
                      x={snapPx.x}
                      y={snapPx.y}
                      width={t.size * grid.cellPx}
                      height={t.size * grid.cellPx}
                      className="tabletop-snap"
                      pointerEvents="none"
                    />
                  )}
                  <g
                    transform={`translate(${c.x} ${c.y})`}
                    className={`tabletop-token${sel ? ' selected' : ''}${t.hidden ? ' hidden-token' : ''}`}
                    onPointerDown={(e) => onTokenPointerDown(e, t)}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      onOpenToken(t)
                    }}
                  >
                    <title>{t.label}{t.hidden ? ' (hidden from players)' : ''}</title>
                    <clipPath id={`tt-clip-${t.id}`}>
                      <circle r={r} />
                    </clipPath>
                    <circle r={r} fill={t.color} />
                    {portrait ? (
                      <image
                        href={portrait}
                        x={-r}
                        y={-r}
                        width={r * 2}
                        height={r * 2}
                        clipPath={`url(#tt-clip-${t.id})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    ) : (
                      <text className="tabletop-initials" textAnchor="middle" dominantBaseline="central" fontSize={r * 0.8}>
                        {initials(t.label)}
                      </text>
                    )}
                    <circle r={r} fill="none" stroke={sel ? '#fff' : t.color} strokeWidth={Math.max(2, r * 0.12)} />
                    <text className="tabletop-label" y={r + grid.cellPx * 0.28} textAnchor="middle" fontSize={Math.max(10, grid.cellPx * 0.26)}>
                      {t.label}
                    </text>
                  </g>
                </g>
              )
            })}

            {box && (
              <rect
                x={Math.min(box.x1, box.x2)}
                y={Math.min(box.y1, box.y2)}
                width={Math.abs(box.x2 - box.x1)}
                height={Math.abs(box.y2 - box.y1)}
                className="tabletop-alignbox"
                pointerEvents="none"
              />
            )}
          </g>
        </svg>
        {aligning && (
          <div className="tabletop-hint">Zoom in, then drag a box around exactly one square on the map to set the grid.</div>
        )}
      </div>
      <div className="tabletop-zoom">
        <button className="btn ghost small" onClick={() => zoomBy(1.2)} title="Zoom in">＋</button>
        <button className="btn ghost small" onClick={() => zoomBy(0.833)} title="Zoom out">－</button>
        <button className="btn ghost small" onClick={fit} title="Fit the whole map">Fit</button>
      </div>
    </div>
  )
}
