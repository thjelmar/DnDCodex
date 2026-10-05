import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { WorldPin } from '../db/types'

interface Transform {
  k: number
  tx: number
  ty: number
}

const MIN_K = 0.1
const MAX_K = 8
const clampK = (k: number) => Math.max(MIN_K, Math.min(MAX_K, k))

/** A pan/zoom image board with pins. Shared by the DM editor and the read-only
 *  player view; the DM passes `editable` to place and drag pins. Pins are stored
 *  as fractions of the image (0–1), so they stay put across zoom and resize. */
export function WorldMapCanvas({
  imageUrl,
  width,
  height,
  pins,
  editable = false,
  selectedPinId = null,
  onSelectPin,
  onAddPin,
  onMovePin,
}: {
  imageUrl: string | null
  width: number
  height: number
  pins: WorldPin[]
  editable?: boolean
  selectedPinId?: string | null
  onSelectPin?: (id: string | null) => void
  onAddPin?: (x: number, y: number) => void
  onMovePin?: (id: string, x: number, y: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [t, setT] = useState<Transform>({ k: 1, tx: 0, ty: 0 })
  // Drag bookkeeping: panning the board vs dragging one pin.
  const drag = useRef<
    | { kind: 'pan'; startX: number; startY: number; t0: Transform; moved: boolean }
    | { kind: 'pin'; id: string; moved: boolean }
    | null
  >(null)

  const imgW = width || 1000
  const imgH = height || 700

  // Fit the image to the container whenever the image (or its size) changes.
  useEffect(() => {
    const el = ref.current
    if (!el || !imageUrl) return
    const r = el.getBoundingClientRect()
    const pad = 24
    const k = clampK(Math.min((r.width - pad) / imgW, (r.height - pad) / imgH))
    setT({ k, tx: (r.width - imgW * k) / 2, ty: (r.height - imgH * k) / 2 })
  }, [imageUrl, imgW, imgH])

  // Wheel zoom around the cursor (non-passive so we can preventDefault).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const cx = e.clientX - r.left
      const cy = e.clientY - r.top
      setT((prev) => {
        const k = clampK(prev.k * Math.exp(-e.deltaY * 0.0015))
        const ratio = k / prev.k
        return { k, tx: cx - (cx - prev.tx) * ratio, ty: cy - (cy - prev.ty) * ratio }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const toNorm = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    return {
      x: (clientX - r.left - t.tx) / (imgW * t.k),
      y: (clientY - r.top - t.ty) / (imgH * t.k),
    }
  }

  function onBackgroundDown(e: ReactPointerEvent) {
    if (e.button !== 0) return
    drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, t0: t, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPinDown(e: ReactPointerEvent, id: string) {
    e.stopPropagation()
    if (editable) onSelectPin?.(id)
    if (!editable) return
    drag.current = { kind: 'pin', id, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onMove(e: ReactPointerEvent) {
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') {
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true
      setT({ k: d.t0.k, tx: d.t0.tx + dx, ty: d.t0.ty + dy })
    } else if (d.kind === 'pin' && editable) {
      d.moved = true
      const n = toNorm(e.clientX, e.clientY)
      onMovePin?.(d.id, clamp01(n.x), clamp01(n.y))
    }
  }

  function onUp(e: ReactPointerEvent) {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'pan' && !d.moved) {
      // A click on empty map: place a pin (edit mode) or clear selection.
      if (editable && imageUrl && onAddPin) {
        const n = toNorm(e.clientX, e.clientY)
        if (n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1) onAddPin(n.x, n.y)
      } else {
        onSelectPin?.(null)
      }
    }
  }

  return (
    <div
      ref={ref}
      className="worldmap-canvas"
      onPointerDown={onBackgroundDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      style={{ cursor: editable ? 'crosshair' : 'grab' }}
    >
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: t.tx,
              top: t.ty,
              width: imgW * t.k,
              height: imgH * t.k,
              maxWidth: 'none',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
          {pins.map((p) => {
            const left = t.tx + p.x * imgW * t.k
            const top = t.ty + p.y * imgH * t.k
            const sel = p.id === selectedPinId
            return (
              <button
                key={p.id}
                className={`worldmap-pin${sel ? ' selected' : ''}`}
                title={p.label || 'Pin'}
                onPointerDown={(e) => onPinDown(e, p.id)}
                onClick={(e) => { e.stopPropagation(); if (!editable) onSelectPin?.(p.id) }}
                style={{ left, top, cursor: editable ? 'move' : 'pointer' }}
              >
                <span className="worldmap-pin-dot" style={{ background: p.color }} />
                {p.label && <span className="worldmap-pin-label">{p.label}</span>}
              </button>
            )
          })}
        </>
      ) : (
        <div className="worldmap-empty-hint">No map image yet.</div>
      )}
    </div>
  )
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
