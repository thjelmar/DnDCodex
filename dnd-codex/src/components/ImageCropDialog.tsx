import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { cropBitmapToProcessed, type CropRect } from '../lib/image'
import type { ProcessedImage } from '../lib/image'

/**
 * Pan and zoom an uploaded image inside the shape it will be shown in, then
 * save the visible part. Drag (mouse or touch) to move, use the slider, the
 * mouse wheel, or a two-finger pinch to zoom. The saved image is the cropped
 * result, re-encoded and downscaled; the original file is not kept.
 */
const FRAME_LONG = 260 // display size of the frame's longer side, in CSS px
const MAX_ZOOM = 4

export function ImageCropDialog({
  file,
  aspect,
  round = false,
  title = 'Adjust image',
  onCancel,
  onSave,
}: {
  file: File
  /** Frame width divided by frame height. */
  aspect: number
  round?: boolean
  title?: string
  onCancel: () => void
  onSave: (processed: ProcessedImage) => void | Promise<void>
}) {
  const frameW = aspect >= 1 ? FRAME_LONG : Math.round(FRAME_LONG * aspect)
  const frameH = aspect >= 1 ? Math.round(FRAME_LONG / aspect) : FRAME_LONG

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(1)
  // Offset of the image centre from the frame centre, in CSS px.
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    createImageBitmap(file, { imageOrientation: 'from-image' })
      .then((b) => (cancelled ? b.close?.() : setBitmap(b)))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  const base = bitmap ? Math.max(frameW / bitmap.width, frameH / bitmap.height) : 1
  const scale = base * zoom

  const clamp = (o: { x: number; y: number }, z: number) => {
    if (!bitmap) return o
    const s = base * z
    const mx = Math.max(0, (bitmap.width * s - frameW) / 2)
    const my = Math.max(0, (bitmap.height * s - frameH) / 2)
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) }
  }

  function applyZoom(z: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, z))
    setZoom(next)
    setOff((o) => clamp(o, next))
  }

  // Pointer handling: one pointer pans, two pointers pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const cur = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, cur)
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch.current.dist > 0) applyZoom((pinch.current.zoom * d) / pinch.current.dist)
    } else {
      const dx = cur.x - prev.x
      const dy = cur.y - prev.y
      setOff((o) => clamp({ x: o.x + dx, y: o.y + dy }, zoom))
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  // Wheel zoom needs a non-passive listener to call preventDefault.
  const frameRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const applyZoomRef = useRef(applyZoom)
  applyZoomRef.current = applyZoom
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      applyZoomRef.current(zoomRef.current * (e.deltaY < 0 ? 1.08 : 1 / 1.08))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const rect: CropRect | null = useMemo(() => {
    if (!bitmap) return null
    const sw = frameW / scale
    const sh = frameH / scale
    return {
      sx: bitmap.width / 2 - off.x / scale - sw / 2,
      sy: bitmap.height / 2 - off.y / scale - sh / 2,
      sw,
      sh,
    }
  }, [bitmap, frameW, frameH, scale, off])

  async function save() {
    if (!bitmap || !rect) return
    setSaving(true)
    try {
      await onSave(cropBitmapToProcessed(bitmap, rect, aspect))
    } catch {
      setError(true)
      setSaving(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!bitmap || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {error ? (
        <p className="faint">Couldn’t read that image.</p>
      ) : (
        <div className="crop-dialog">
          <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>
            Drag to move, pinch or use the slider to zoom.
          </p>
          <div
            ref={frameRef}
            className={`crop-frame${round ? ' round' : ''}`}
            data-testid="crop-frame"
            style={{ width: frameW, height: frameH }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {bitmap && url && (
              <img
                src={url}
                alt=""
                draggable={false}
                className="crop-img"
                style={{
                  width: bitmap.width * scale,
                  height: bitmap.height * scale,
                  transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))`,
                }}
              />
            )}
          </div>
          <label className="crop-zoom">
            <span className="faint" style={{ fontSize: 12 }}>Zoom</span>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              aria-label="Zoom"
              onChange={(e) => applyZoom(Number(e.target.value))}
            />
          </label>
        </div>
      )}
    </Modal>
  )
}
