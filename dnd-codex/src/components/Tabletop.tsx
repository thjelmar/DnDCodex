import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { SceneFog, SceneGrid, SceneToken } from '../db/types'
import {
  MAX_TOKEN_SIZE,
  MIN_CELL_SCREEN,
  cellKey,
  cellToPx,
  clampZoom,
  gridPath,
  initials,
  pxToCell,
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
  | { kind: 'resize'; id: string; left: number; top: number }
  | { kind: 'fog'; reveal: boolean }

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
  onResizeToken: (id: string, size: number) => void
  onDeleteToken: (id: string) => void
  onOpenToken: (token: SceneToken) => void
  /** When true, dragging draws a box around map squares to set the grid. */
  aligning: boolean
  /** The finished align box, in board px. */
  onAlign: (box: { x1: number; y1: number; x2: number; y2: number }) => void
  /** Kept up to date with the board point at the center of the viewport. */
  centerRef?: MutableRefObject<{ x: number; y: number }>
  /** False = viewer mode (players, DM preview): no resizing, deleting, or
   *  aligning; only tokens passing `canMoveToken` can be dragged. */
  editable?: boolean
  canMoveToken?: (t: SceneToken) => boolean
  /** Tokens to ring as "yours" (the player's own). */
  ownIds?: Set<string>
  /** Fog of war to render, or null for none. Covered cells are dimmed for the
   *  DM (editable) and opaque for players (viewer mode). */
  fog?: SceneFog | null
  /** When set, dragging the board paints fog instead of panning. */
  fogTool?: 'reveal' | 'hide' | null
  /** Commit a painted stroke: reveal or hide the given cell keys. */
  onPaintFog?: (cellKeys: string[], reveal: boolean) => void
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
  onResizeToken,
  onDeleteToken,
  onOpenToken,
  aligning,
  onAlign,
  centerRef,
  editable = true,
  canMoveToken,
  ownIds,
  fog,
  fogTool,
  onPaintFog,
}: Props) {
  const movable = (t: SceneToken) => (canMoveToken ? canMoveToken(t) : editable)
  const wrapRef = useRef<HTMLDivElement>(null)
  const maskId = useId()
  const [transform, setTransform] = useState({ k: 1, tx: 0, ty: 0 })
  const drag = useRef<Drag | null>(null)
  // Live position of a token being dragged (board px, center) and the align box.
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [box, setBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  // Live footprint while dragging a token's resize handle.
  const [resizing, setResizing] = useState<{ id: string; size: number } | null>(null)
  // Cells painted in the current fog stroke (applied to the mask live, committed
  // to the parent on pointer-up).
  const [fogStroke, setFogStroke] = useState<{ reveal: boolean; cells: Set<string> } | null>(null)

  const toBoard = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left - transform.tx) / transform.k,
      y: (clientY - rect.top - transform.ty) / transform.k,
    }
  }

  /** Show the whole board (the Fit button). */
  function fit() {
    const el = wrapRef.current
    if (!el) return
    const { clientWidth: w, clientHeight: h } = el
    const k = clampZoom(Math.min(w / width, h / height) * 0.95)
    setTransform({ k, tx: (w - width * k) / 2, ty: (h - height * k) / 2 })
  }

  /**
   * The opening view: the whole board, unless that would shrink squares below a
   * usable size (a big map in a small pane). Then zoom to MIN_CELL_SCREEN px per
   * square, centered on the tokens (or the board's middle if there are none).
   */
  function initialView() {
    const el = wrapRef.current
    if (!el) return
    const { clientWidth: w, clientHeight: h } = el
    const fitK = clampZoom(Math.min(w / width, h / height) * 0.95)
    if (fitK * grid.cellPx >= MIN_CELL_SCREEN) return fit()
    const k = clampZoom(MIN_CELL_SCREEN / grid.cellPx)
    let cx = width / 2
    let cy = height / 2
    const ts = tokensRef.current
    if (ts.length) {
      const cs = ts.map((t) => tokenCenter(grid, t))
      const xs = cs.map((c) => c.x)
      const ys = cs.map((c) => c.y)
      cx = (Math.min(...xs) + Math.max(...xs)) / 2
      cy = (Math.min(...ys) + Math.max(...ys)) / 2
    }
    setTransform({ k, tx: w / 2 - cx * k, ty: h / 2 - cy * k })
  }
  const tokensRef = useRef(tokens)
  tokensRef.current = tokens
  // Opening view on first render and whenever the board size changes.
  useEffect(initialView, [width, height]) // eslint-disable-line react-hooks/exhaustive-deps
  // ...and when the viewport itself is resized (full screen, panel toggled).
  const fitRef = useRef(initialView)
  fitRef.current = initialView
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let last = { w: el.clientWidth, h: el.clientHeight }
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (Math.abs(w - last.w) > 40 || Math.abs(h - last.h) > 40) {
        last = { w, h }
        fitRef.current()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
    if (fogTool) {
      const p = toBoard(e.clientX, e.clientY)
      const c = pxToCell(grid, p.x, p.y)
      drag.current = { kind: 'fog', reveal: fogTool === 'reveal' }
      setFogStroke({ reveal: fogTool === 'reveal', cells: new Set([cellKey(c.col, c.row)]) })
      return
    }
    if (aligning) {
      const p = toBoard(e.clientX, e.clientY)
      drag.current = { kind: 'align', x1: p.x, y1: p.y }
      setBox({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
      return
    }
    drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, tx: transform.tx, ty: transform.ty }
  }

  function onTokenPointerDown(e: React.PointerEvent, t: SceneToken) {
    // In fog-paint mode let the press fall through to the background painter.
    if (e.button !== 0 || aligning || fogTool) return
    // Non-movable tokens let the press fall through to panning.
    if (!movable(t)) return
    e.stopPropagation()
    wrapRef.current?.focus()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const c = tokenCenter(grid, t)
    const p = toBoard(e.clientX, e.clientY)
    drag.current = { kind: 'token', id: t.id, dx: c.x - p.x, dy: c.y - p.y, moved: false }
    onSelect(t.id)
  }

  function onHandlePointerDown(e: React.PointerEvent, t: SceneToken) {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const p = cellToPx(grid, t.col, t.row)
    drag.current = { kind: 'resize', id: t.id, left: p.x, top: p.y }
    setResizing({ id: t.id, size: t.size })
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    if (d.kind === 'resize') {
      // Size follows the handle: the footprint is anchored at the top-left cell.
      const p = toBoard(e.clientX, e.clientY)
      const span = Math.max(p.x - d.left, p.y - d.top) / grid.cellPx
      setResizing({ id: d.id, size: Math.min(MAX_TOKEN_SIZE, Math.max(1, Math.round(span))) })
    } else if (d.kind === 'pan') {
      setTransform((t) => ({ ...t, tx: d.tx + (e.clientX - d.startX), ty: d.ty + (e.clientY - d.startY) }))
    } else if (d.kind === 'token') {
      const p = toBoard(e.clientX, e.clientY)
      d.moved = true
      setDragPos({ id: d.id, x: p.x + d.dx, y: p.y + d.dy })
    } else if (d.kind === 'fog') {
      const p = toBoard(e.clientX, e.clientY)
      const c = pxToCell(grid, p.x, p.y)
      const key = cellKey(c.col, c.row)
      setFogStroke((s) => (s && !s.cells.has(key) ? { ...s, cells: new Set(s.cells).add(key) } : s))
    } else {
      const p = toBoard(e.clientX, e.clientY)
      setBox({ x1: d.x1, y1: d.y1, x2: p.x, y2: p.y })
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'resize') {
      const t = tokens.find((x) => x.id === d.id)
      if (t && resizing && resizing.size !== t.size) onResizeToken(t.id, resizing.size)
      setResizing(null)
    } else if (d.kind === 'pan') {
      // A click (not a pan) on empty board clears the selection.
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) onSelect(null)
    } else if (d.kind === 'token') {
      const t = tokens.find((x) => x.id === d.id)
      if (t && d.moved && dragPos && dragPos.id === d.id) {
        const cell = snapCenterToCell(grid, dragPos.x, dragPos.y, t.size)
        if (cell.col !== t.col || cell.row !== t.row) onMoveToken(t.id, cell.col, cell.row)
      }
      setDragPos(null)
    } else if (d.kind === 'fog') {
      if (fogStroke && fogStroke.cells.size) onPaintFog?.([...fogStroke.cells], fogStroke.reveal)
      setFogStroke(null)
    } else if (box) {
      setBox(null)
      if (Math.abs(box.x2 - box.x1) >= 8 && Math.abs(box.y2 - box.y1) >= 8) onAlign(box)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const t = tokens.find((x) => x.id === selectedId)
    if (!t || !movable(t)) return
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
    } else if (!editable) {
      if (e.key === 'Escape') onSelect(null)
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      onResizeToken(t.id, Math.min(MAX_TOKEN_SIZE, t.size + 1))
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      onResizeToken(t.id, Math.max(1, t.size - 1))
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onDeleteToken(t.id)
    } else if (e.key === 'Escape') {
      onSelect(null)
    } else if (e.key === 'Enter') {
      onOpenToken(t)
    }
  }

  // Real lines (not a tiled <pattern>) so fractional square sizes stay exact
  // and the stroke isn't half-clipped at tile edges.
  const lines = useMemo(() => gridPath(grid, width, height), [grid, width, height])
  // Draw selected + dragged tokens last so they sit on top.
  const ordered = [...tokens].sort(
    (a, b) => Number(a.id === selectedId || a.id === dragPos?.id) - Number(b.id === selectedId || b.id === dragPos?.id),
  )
  // Revealed cells for the fog mask, with the in-progress stroke applied live.
  const fogRevealed = useMemo(() => {
    if (!fog?.enabled) return null
    const s = new Set(fog.revealed)
    if (fogStroke) for (const k of fogStroke.cells) fogStroke.reveal ? s.add(k) : s.delete(k)
    return s
  }, [fog, fogStroke])
  // DM (editable) sees a dim veil over covered cells; players see it opaque.
  const fogOpaque = !editable

  return (
    <div className="tabletop">
      <div
        ref={wrapRef}
        className={`tabletop-view${aligning ? ' aligning' : ''}${fogTool ? ' fogging' : ''}`}
        tabIndex={0}
        onPointerDown={onBgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        aria-label="Battle map board"
      >
        <svg width="100%" height="100%">
          <g transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.k})`}>
            <rect x={0} y={0} width={width} height={height} className="tabletop-board" />
            {mapUrl && <image href={mapUrl} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />}
            {(grid.show || aligning) && (
              <path
                d={lines}
                fill="none"
                stroke={grid.color}
                strokeOpacity={0.55}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}

            {/* Fog of war: a veil over every cell that isn't revealed. The mask
                is white (veil shows) everywhere except revealed cells, which are
                black (veil hidden). Drawn under the tokens. */}
            {fog?.enabled && fogRevealed && (
              <>
                <mask id={`fog-${maskId}`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
                  <rect x={0} y={0} width={width} height={height} fill="#fff" />
                  {[...fogRevealed].map((k) => {
                    const [c, r] = k.split(',').map(Number)
                    const p = cellToPx(grid, c, r)
                    return <rect key={k} x={p.x} y={p.y} width={grid.cellPx} height={grid.cellPx} fill="#000" />
                  })}
                </mask>
                <rect
                  x={0}
                  y={0}
                  width={width}
                  height={height}
                  className={fogOpaque ? 'tabletop-fog-opaque' : 'tabletop-fog-dim'}
                  mask={`url(#fog-${maskId})`}
                  pointerEvents="none"
                />
              </>
            )}

            {ordered.map((raw) => {
              const t = resizing?.id === raw.id ? { ...raw, size: resizing.size } : raw
              const live = dragPos?.id === t.id ? dragPos : null
              const c = live ?? tokenCenter(grid, t)
              const r = (t.size * grid.cellPx) / 2 - Math.max(1.5, grid.cellPx * 0.05)
              const portrait = t.imageId ? portraits[t.imageId] : undefined
              const sel = t.id === selectedId
              const own = ownIds?.has(t.id) ?? false
              // Ghost of the snap target while dragging.
              const snap = live ? snapCenterToCell(grid, live.x, live.y, t.size) : null
              const snapPx = snap ? cellToPx(grid, snap.col, snap.row) : null
              return (
                <g key={t.id}>
                  {resizing?.id === t.id && (
                    <rect
                      {...cellToPx(grid, t.col, t.row)}
                      width={t.size * grid.cellPx}
                      height={t.size * grid.cellPx}
                      className="tabletop-snap"
                      pointerEvents="none"
                    />
                  )}
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
                    className={`tabletop-token${sel ? ' selected' : ''}${t.hidden ? ' hidden-token' : ''}${movable(t) ? '' : ' fixed'}${own ? ' own' : ''}`}
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
                    {/* Font/offset are in board units (inside scale(k)), so they'd
                        collapse when zoomed out. Floor the on-screen size (…/k keeps
                        a constant screen px) so labels stay readable at low zoom,
                        while the board-relative value still wins when zoomed in. */}
                    <text
                      className="tabletop-label"
                      y={r + Math.max(grid.cellPx * 0.28, 9 / transform.k)}
                      textAnchor="middle"
                      fontSize={Math.max(grid.cellPx * 0.26, 11 / transform.k)}
                    >
                      {t.label}
                    </text>
                    {own && <circle r={r + Math.max(3, r * 0.14)} className="tabletop-own-ring" />}
                    {sel && !live && editable && (
                      <g
                        className="tabletop-resize"
                        transform={`translate(${r * 0.72} ${r * 0.72})`}
                        onPointerDown={(e) => onHandlePointerDown(e, raw)}
                      >
                        <title>Drag to resize ({t.size}×{t.size})</title>
                        <circle r={9 / transform.k} />
                        <path
                          d={`M ${-3.5 / transform.k} ${3.5 / transform.k} L ${3.5 / transform.k} ${-3.5 / transform.k}`}
                          strokeWidth={1.6 / transform.k}
                        />
                      </g>
                    )}
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
          <div className="tabletop-hint">Zoom in, then drag a box around one or more whole squares, edge to edge on the map's lines.</div>
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
