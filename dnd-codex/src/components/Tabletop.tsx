import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import type { SceneFog, SceneGrid, SceneTemplate, SceneToken, TemplateShape, TokenCombat } from '../db/types'
import {
  MAX_TOKEN_SIZE,
  MIN_CELL_SCREEN,
  cellCenterPx,
  cellIsFree,
  cellKey,
  cellToPx,
  clampZoom,
  gridPath,
  initials,
  measureFeet,
  nearestFreeCell,
  pxToCell,
  snapCenterToCell,
  templateCells,
  templateGeom,
  tokenCenter,
} from '../lib/tabletop'
import { conditionMeta } from '../lib/combat'
import { conditionIcon } from '../lib/conditionIcons'

// The battle-map board: an SVG viewport with pan (drag the background), zoom
// (wheel, around the cursor), a map image, a calibratable square grid, and
// draggable tokens that snap to cells on drop. Controlled: the parent owns the
// scene and persists changes.

type Drag =
  // `selectId` set = the press began on a token that can't be moved; a tap
  // (no pan) selects it (to show its card) instead of clearing the selection.
  | { kind: 'pan'; startX: number; startY: number; tx: number; ty: number; selectId?: string }
  | { kind: 'token'; id: string; dx: number; dy: number; moved: boolean }
  | { kind: 'align'; x1: number; y1: number }
  | { kind: 'resize'; id: string; left: number; top: number }
  | { kind: 'fog'; reveal: boolean }
  | { kind: 'measure'; x1: number; y1: number }
  | { kind: 'template'; col: number; row: number }

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
  /** Brush radius in cells: 0 = one cell, 1 = 3×3, 2 = 5×5, … */
  fogBrush?: number
  /** Commit a painted stroke: reveal or hide the given cell keys. */
  onPaintFog?: (cellKeys: string[], reveal: boolean) => void
  /** Per-token combat overlay: HP bar / damage taken, conditions, active turn. */
  combat?: Record<string, TokenCombat>
  /** Placed area templates to render (spell areas etc.), or none. */
  templates?: SceneTemplate[]
  /** When set, clicking/dragging the board places a template of this shape. */
  templateTool?: { shape: TemplateShape; sizeFt: number; color: string } | null
  /** Commit a placed template (origin in cells, plus aim for cone/line). */
  onPlaceTemplate?: (t: { shape: TemplateShape; col: number; row: number; sizeFt: number; dir?: number; color: string }) => void
  /** When true, dragging the board measures a distance in feet (ephemeral). */
  measureTool?: boolean
  /** Content for a small card floated just above the selected token (its quick
   *  combat info / actions). Returning null shows nothing. The card is hidden
   *  while a board tool is active or the token is being dragged or resized. */
  renderTokenPanel?: (token: SceneToken) => ReactNode
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
  fogBrush = 0,
  onPaintFog,
  combat,
  templates,
  templateTool,
  onPlaceTemplate,
  measureTool = false,
  renderTokenPanel,
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
  // Cell under the cursor while in fog mode (for the brush-size preview outline).
  const [fogHover, setFogHover] = useState<{ col: number; row: number } | null>(null)
  const fogLastCell = useRef<string | null>(null)
  // Live ruler endpoints (board px) while measuring; null when idle.
  const [measure, setMeasure] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  // Live template being aimed (origin cell + current aim point) while placing.
  const [templateAim, setTemplateAim] = useState<{ col: number; row: number; ax: number; ay: number } | null>(null)

  const toBoard = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left - transform.tx) / transform.k,
      y: (clientY - rect.top - transform.ty) / transform.k,
    }
  }

  // Cells a brush stroke touches at (col,row): a square of side 2·fogBrush+1.
  const brushRadius = Math.max(0, Math.round(fogBrush))
  const brushKeys = (col: number, row: number): string[] => {
    const keys: string[] = []
    for (let dc = -brushRadius; dc <= brushRadius; dc++)
      for (let dr = -brushRadius; dr <= brushRadius; dr++) keys.push(cellKey(col + dc, row + dr))
    return keys
  }
  // Drop the brush preview when leaving fog mode.
  useEffect(() => {
    if (!fogTool) setFogHover(null)
  }, [fogTool])
  // Drop the in-progress ruler / template preview when leaving those modes.
  useEffect(() => {
    if (!measureTool) setMeasure(null)
  }, [measureTool])
  useEffect(() => {
    if (!templateTool) setTemplateAim(null)
  }, [templateTool])

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
    if (measureTool) {
      const p = toBoard(e.clientX, e.clientY)
      drag.current = { kind: 'measure', x1: p.x, y1: p.y }
      setMeasure({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
      return
    }
    if (templateTool) {
      const p = toBoard(e.clientX, e.clientY)
      // Snap the origin to the nearest grid intersection (spells emanate from a point).
      const col = Math.round((p.x - grid.offsetX) / grid.cellPx)
      const row = Math.round((p.y - grid.offsetY) / grid.cellPx)
      drag.current = { kind: 'template', col, row }
      setTemplateAim({ col, row, ax: p.x, ay: p.y })
      return
    }
    if (fogTool) {
      const p = toBoard(e.clientX, e.clientY)
      const c = pxToCell(grid, p.x, p.y)
      fogLastCell.current = cellKey(c.col, c.row)
      drag.current = { kind: 'fog', reveal: fogTool === 'reveal' }
      setFogStroke({ reveal: fogTool === 'reveal', cells: new Set(brushKeys(c.col, c.row)) })
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
    // In a board tool mode (fog paint, measure, template) let the press fall
    // through to the background handler instead of grabbing the token.
    if (e.button !== 0 || aligning || fogTool || measureTool || templateTool) return
    // Non-movable tokens can't be dragged, but a tap still selects one (to show
    // its status card) while a drag still pans the board.
    if (!movable(t)) {
      e.stopPropagation()
      drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, tx: transform.tx, ty: transform.ty, selectId: t.id }
      return
    }
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
    if (!d) {
      // Not dragging: while in fog mode, track the hovered cell for the brush preview.
      if (fogTool) {
        const p = toBoard(e.clientX, e.clientY)
        const c = pxToCell(grid, p.x, p.y)
        setFogHover((h) => (h && h.col === c.col && h.row === c.row ? h : c))
      }
      return
    }
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
      if (key === fogLastCell.current) return
      fogLastCell.current = key
      setFogStroke((s) => {
        if (!s) return s
        const next = new Set(s.cells)
        for (const k of brushKeys(c.col, c.row)) next.add(k)
        return { ...s, cells: next }
      })
    } else if (d.kind === 'measure') {
      const p = toBoard(e.clientX, e.clientY)
      setMeasure({ x1: d.x1, y1: d.y1, x2: p.x, y2: p.y })
    } else if (d.kind === 'template') {
      const p = toBoard(e.clientX, e.clientY)
      setTemplateAim({ col: d.col, row: d.row, ax: p.x, ay: p.y })
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
      // A click (not a pan) selects the token it began on, or clears the
      // selection when it began on empty board.
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) onSelect(d.selectId ?? null)
    } else if (d.kind === 'token') {
      const t = tokens.find((x) => x.id === d.id)
      if (t && d.moved && dragPos && dragPos.id === d.id) {
        const raw = snapCenterToCell(grid, dragPos.x, dragPos.y, t.size)
        // Land on the nearest open cell so tokens don't stack (overlapping labels).
        const cell = nearestFreeCell(tokens, t.id, raw.col, raw.row, t.size)
        if (cell.col !== t.col || cell.row !== t.row) onMoveToken(t.id, cell.col, cell.row)
      }
      setDragPos(null)
    } else if (d.kind === 'fog') {
      if (fogStroke && fogStroke.cells.size) onPaintFog?.([...fogStroke.cells], fogStroke.reveal)
      setFogStroke(null)
    } else if (d.kind === 'measure') {
      setMeasure(null) // ephemeral: the ruler shows while dragging, then clears
    } else if (d.kind === 'template') {
      if (templateTool) {
        const ox = grid.offsetX + d.col * grid.cellPx
        const oy = grid.offsetY + d.row * grid.cellPx
        const p = toBoard(e.clientX, e.clientY)
        const dir = templateTool.shape === 'circle' ? undefined : Math.atan2(p.y - oy, p.x - ox)
        onPlaceTemplate?.({ shape: templateTool.shape, col: d.col, row: d.row, sizeFt: templateTool.sizeFt, dir, color: templateTool.color })
      }
      setTemplateAim(null)
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
      // Don't nudge onto a cell another token holds.
      if (cellIsFree(tokens, t.id, t.col + dc, t.row + dr, t.size)) onMoveToken(t.id, t.col + dc, t.row + dr)
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

  // The token whose floating card is showing: the selection, unless a board tool
  // is active or that token is mid-drag/resize (then the card would fight the
  // interaction). Positioned in screen px below.
  const panelToken =
    renderTokenPanel && selectedId && !aligning && !fogTool && !templateTool && !measureTool && dragPos?.id !== selectedId && resizing?.id !== selectedId
      ? tokens.find((t) => t.id === selectedId) ?? null
      : null
  const panelContent = panelToken ? renderTokenPanel!(panelToken) : null
  let panelPos: { left: number; top: number; below: boolean } | null = null
  if (panelToken && panelContent) {
    const c = tokenCenter(grid, panelToken)
    const r = (panelToken.size * grid.cellPx) / 2 - Math.max(1.5, grid.cellPx * 0.05)
    const topY = transform.ty + (c.y - r) * transform.k
    const bottomY = transform.ty + (c.y + r) * transform.k
    const below = topY < 168 // too little room above the token → drop the card below it
    const viewW = wrapRef.current?.clientWidth ?? 0
    const rawLeft = transform.tx + c.x * transform.k
    // Keep the (center-anchored) card from spilling past the board's edges.
    const left = viewW > 300 ? Math.max(140, Math.min(viewW - 140, rawLeft)) : rawLeft
    panelPos = { left, top: below ? bottomY : topY, below }
  }

  return (
    <div className="tabletop">
      <div
        ref={wrapRef}
        className={`tabletop-view${aligning ? ' aligning' : ''}${fogTool ? ' fogging' : ''}${measureTool || templateTool ? ' crosshair' : ''}`}
        tabIndex={0}
        onPointerDown={onBgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setFogHover(null)}
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

            {/* Area templates (spell areas, cones, lines). Drawn over the grid
                and under the tokens: the covered squares are tinted and the
                shape outlined in the template's color. */}
            {templates?.map((tpl) => {
              const geom = templateGeom(grid, tpl)
              const cells = templateCells(grid, width, height, tpl)
              return (
                <g key={tpl.id} className="tabletop-template" pointerEvents="none" style={{ color: tpl.color }}>
                  {cells.map((k) => {
                    const [c, r] = k.split(',').map(Number)
                    const p = cellToPx(grid, c, r)
                    return <rect key={k} x={p.x} y={p.y} width={grid.cellPx} height={grid.cellPx} className="tabletop-template-cell" />
                  })}
                  {geom.kind === 'circle' ? (
                    <circle cx={geom.cx} cy={geom.cy} r={geom.r} className="tabletop-template-shape" />
                  ) : (
                    <polygon points={geom.points.map((pt) => pt.join(',')).join(' ')} className="tabletop-template-shape" />
                  )}
                  {tpl.label && (
                    <text x={grid.offsetX + tpl.col * grid.cellPx} y={grid.offsetY + tpl.row * grid.cellPx} className="tabletop-template-label" textAnchor="middle" dominantBaseline="central">
                      {tpl.label}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Live preview of the template being placed. */}
            {templateTool && templateAim && (() => {
              const dir = templateTool.shape === 'circle' ? undefined : Math.atan2(templateAim.ay - (grid.offsetY + templateAim.row * grid.cellPx), templateAim.ax - (grid.offsetX + templateAim.col * grid.cellPx))
              const ghost: SceneTemplate = { id: 'ghost', shape: templateTool.shape, col: templateAim.col, row: templateAim.row, sizeFt: templateTool.sizeFt, dir, color: templateTool.color }
              const geom = templateGeom(grid, ghost)
              return (
                <g className="tabletop-template ghost" pointerEvents="none" style={{ color: templateTool.color }}>
                  {geom.kind === 'circle' ? (
                    <circle cx={geom.cx} cy={geom.cy} r={geom.r} className="tabletop-template-shape" />
                  ) : (
                    <polygon points={geom.points.map((pt) => pt.join(',')).join(' ')} className="tabletop-template-shape" />
                  )}
                </g>
              )
            })()}

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

            {/* Brush-size preview: outline the cells the next stroke will touch. */}
            {fogTool && fogHover && !fogStroke && (
              <rect
                {...cellToPx(grid, fogHover.col - brushRadius, fogHover.row - brushRadius)}
                width={(2 * brushRadius + 1) * grid.cellPx}
                height={(2 * brushRadius + 1) * grid.cellPx}
                className="tabletop-fog-brush"
                pointerEvents="none"
              />
            )}

            {ordered.map((raw) => {
              const t = resizing?.id === raw.id ? { ...raw, size: resizing.size } : raw
              const live = dragPos?.id === t.id ? dragPos : null
              // While dragging, the token snaps magnetically to the center of the
              // nearest open cell (footprint-aware) rather than free-floating under
              // the cursor; snapPx also frames that square (the ghost outline below).
              const rawSnap = live ? snapCenterToCell(grid, live.x, live.y, t.size) : null
              const snap = rawSnap ? nearestFreeCell(tokens, t.id, rawSnap.col, rawSnap.row, t.size) : null
              const snapPx = snap ? cellToPx(grid, snap.col, snap.row) : null
              const halfPx = (t.size * grid.cellPx) / 2
              const c = snapPx ? { x: snapPx.x + halfPx, y: snapPx.y + halfPx } : tokenCenter(grid, t)
              const r = (t.size * grid.cellPx) / 2 - Math.max(1.5, grid.cellPx * 0.05)
              const portrait = t.imageId ? portraits[t.imageId] : undefined
              const sel = t.id === selectedId
              const own = ownIds?.has(t.id) ?? false
              const cc = combat?.[t.id]
              // Combat overlay stacks below the token — token → HP bar/damage →
              // name — so the stat never covers the name. Conditions arc the top.
              const belowGap = Math.max(2, 2.5 / transform.k)
              const nameFont = Math.max(grid.cellPx * 0.26, 11 / transform.k)
              const hpTracked = !!cc && cc.hp != null && cc.maxHp != null && cc.maxHp > 0
              const showDmg = !!cc && !hpTracked && (cc.damageTaken ?? 0) > 0
              const barH = Math.max(3.5, r * 0.16)
              const dmgFont = Math.max(grid.cellPx * 0.24, 11 / transform.k)
              const statH = hpTracked ? barH : showDmg ? dmgFont : 0
              const statTop = r + belowGap
              const nameTop = r + belowGap + (statH > 0 ? statH + belowGap : 0)
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

                    {/* Active-turn ring, then the HP bar / damage number, then the
                        name below it — the stat never overlaps the name. */}
                    {cc?.active && <circle r={r + Math.max(4, r * 0.2)} className="tabletop-combat-active" pointerEvents="none" />}
                    {hpTracked && (() => {
                      const frac = Math.max(0, Math.min(1, (cc!.hp as number) / (cc!.maxHp as number)))
                      const bw = r * 1.7
                      const cls = frac > 0.5 ? 'hp-hi' : frac > 0.25 ? 'hp-mid' : 'hp-lo'
                      return (
                        <g pointerEvents="none">
                          <rect x={-bw / 2} y={statTop} width={bw} height={barH} rx={barH / 2} className="tabletop-hp-bg" />
                          <rect x={-bw / 2} y={statTop} width={bw * frac} height={barH} rx={barH / 2} className={`tabletop-hp-fill ${cls}`} />
                        </g>
                      )
                    })()}
                    {showDmg && (
                      <text
                        className="tabletop-dmg"
                        y={statTop}
                        textAnchor="middle"
                        dominantBaseline="hanging"
                        fontSize={dmgFont}
                        pointerEvents="none"
                      >
                        −{cc!.damageTaken}
                      </text>
                    )}
                    <text
                      className="tabletop-label"
                      y={nameTop}
                      textAnchor="middle"
                      dominantBaseline="hanging"
                      fontSize={nameFont}
                    >
                      {t.label}
                    </text>
                    {own && <circle r={r + Math.max(3, r * 0.14)} className="tabletop-own-ring" />}

                    {/* Conditions: colored status pips arced around the token's top
                        edge (Owlbear-style), full names on hover. Clear of the name. */}
                    {cc?.conditions && cc.conditions.length > 0 && (() => {
                      const shown = cc.conditions.slice(0, 5)
                      const extra = cc.conditions.length - shown.length
                      const items = [...shown, ...(extra > 0 ? ['+'] : [])]
                      const pr = Math.max(r * 0.26, 6 / transform.k)
                      const ringR = r - pr * 0.2
                      const step = Math.min(Math.PI / 3.2, (pr * 2.15) / ringR)
                      const a0 = -Math.PI / 2 - ((items.length - 1) * step) / 2
                      return (
                        <g pointerEvents="none">
                          <title>{cc.conditions.join(', ')}</title>
                          {items.map((name, i) => {
                            const a = a0 + i * step
                            const x = ringR * Math.cos(a)
                            const y = ringR * Math.sin(a)
                            const isMore = name === '+'
                            const meta = isMore ? null : conditionMeta(name)
                            return (
                              <g key={isMore ? 'more' : name} transform={`translate(${x} ${y})`}>
                                <circle r={pr} fill={meta ? meta.color : undefined} className={`tabletop-cond-pip${isMore ? ' more' : ''}`} />
                                {isMore ? (
                                  <text className="tabletop-cond-code" textAnchor="middle" dominantBaseline="central" fontSize={pr * 1.02}>+{extra}</text>
                                ) : (
                                  <g className="tabletop-cond-glyph" transform={`scale(${pr / 10.5})`}>{conditionIcon(name)}</g>
                                )}
                              </g>
                            )
                          })}
                        </g>
                      )
                    })()}

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

            {/* Ruler: a live line with the distance in feet, drawn over everything.
                Both ends snap to the center of the square they're over, so it
                measures square-to-square (matching how tokens occupy cells). */}
            {measure && (() => {
              const s = pxToCell(grid, measure.x1, measure.y1)
              const e = pxToCell(grid, measure.x2, measure.y2)
              const a = cellCenterPx(grid, s.col, s.row)
              const b = cellCenterPx(grid, e.col, e.row)
              return (
                <g className="tabletop-ruler" pointerEvents="none">
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" />
                  <circle cx={a.x} cy={a.y} r={4 / transform.k} />
                  <circle cx={b.x} cy={b.y} r={4 / transform.k} />
                  <g transform={`translate(${b.x} ${b.y})`}>
                    <text className="tabletop-ruler-label" x={10 / transform.k} y={-10 / transform.k} fontSize={14 / transform.k}>
                      {measureFeet(grid, a.x, a.y, b.x, b.y)} ft
                    </text>
                  </g>
                </g>
              )
            })()}
          </g>
        </svg>
        {aligning && (
          <div className="tabletop-hint">Zoom in, then drag a box around one or more whole squares, edge to edge on the map's lines.</div>
        )}
      </div>
      {panelPos && (
        // Outside .tabletop-view (a sibling, like the zoom buttons) so the card's
        // own clicks and wheel never reach the board's pan/zoom/deselect handlers,
        // and it isn't clipped by the board's overflow:hidden.
        <div
          className={`tabletop-token-panel${panelPos.below ? ' below' : ''}`}
          style={{ left: panelPos.left, top: panelPos.top }}
        >
          {panelContent}
        </div>
      )}
      <div className="tabletop-zoom">
        <button className="btn ghost small" onClick={() => zoomBy(1.2)} title="Zoom in">＋</button>
        <button className="btn ghost small" onClick={() => zoomBy(0.833)} title="Zoom out">－</button>
        <button className="btn ghost small" onClick={fit} title="Fit the whole map">Fit</button>
      </div>
    </div>
  )
}
