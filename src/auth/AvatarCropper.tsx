import { useEffect, useRef, useState } from 'react'

// A small dependency-free avatar cropper. The picked image is drawn into a
// square viewport that the user can drag (reposition) and zoom (slider). A
// circular overlay previews the round avatar. On confirm, the exact framed
// region is redrawn to an OUT×OUT canvas and exported as a compact WebP data URL
// — the same size/format the auto-crop produced, just user-chosen.

const VIEW = 240 // on-screen viewport (CSS px)
const OUT = 256 // exported avatar size
const MAX_MULT = 5 // max zoom = 5× the cover scale
const QUALITY = 0.85

export function AvatarCropper({
  file,
  onCancel,
  onConfirm,
}: {
  file: File
  onCancel: () => void
  onConfirm: (dataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [minScale, setMinScale] = useState(1)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [error, setError] = useState('')
  const drag = useRef<{ x: number; y: number } | null>(null)

  // Decode the file and start centered at the "cover" zoom.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
        if (cancelled) {
          bmp.close?.()
          return
        }
        const min = VIEW / Math.min(bmp.width, bmp.height)
        setBitmap(bmp)
        setMinScale(min)
        setScale(min)
        setOffset({ x: (VIEW - bmp.width * min) / 2, y: (VIEW - bmp.height * min) / 2 })
      } catch {
        if (!cancelled) setError('Could not load that image.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file])

  // Keep the scaled image covering the viewport (no empty gaps).
  function clampOffset(o: { x: number; y: number }, s: number, bmp: ImageBitmap) {
    const w = bmp.width * s
    const h = bmp.height * s
    return {
      x: Math.min(0, Math.max(VIEW - w, o.x)),
      y: Math.min(0, Math.max(VIEW - h, o.y)),
    }
  }

  // Redraw whenever the framing changes.
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !bitmap) return
    const dpr = window.devicePixelRatio || 1
    c.width = VIEW * dpr
    c.height = VIEW * dpr
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, VIEW, VIEW)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, offset.x, offset.y, bitmap.width * scale, bitmap.height * scale)
  }, [bitmap, scale, offset])

  function onPointerDown(e: React.PointerEvent) {
    if (!bitmap) return
    drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !bitmap) return
    setOffset(clampOffset({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }, scale, bitmap))
  }
  function endDrag() {
    drag.current = null
  }

  // Zoom about the viewport center so framing stays intuitive.
  function applyScale(next: number) {
    if (!bitmap) return
    const s1 = Math.max(minScale, Math.min(minScale * MAX_MULT, next))
    const cx = (VIEW / 2 - offset.x) / scale
    const cy = (VIEW / 2 - offset.y) / scale
    setScale(s1)
    setOffset(clampOffset({ x: VIEW / 2 - cx * s1, y: VIEW / 2 - cy * s1 }, s1, bitmap))
  }

  function confirm() {
    if (!bitmap) return
    const k = OUT / VIEW
    const out = document.createElement('canvas')
    out.width = OUT
    out.height = OUT
    const octx = out.getContext('2d')
    if (!octx) return
    octx.imageSmoothingQuality = 'high'
    octx.drawImage(
      bitmap,
      0,
      0,
      bitmap.width,
      bitmap.height,
      offset.x * k,
      offset.y * k,
      bitmap.width * scale * k,
      bitmap.height * scale * k,
    )
    let url = out.toDataURL('image/webp', QUALITY)
    if (!url.startsWith('data:image/webp')) url = out.toDataURL('image/jpeg', QUALITY)
    onConfirm(url)
  }

  if (error) {
    return (
      <div>
        <p className="danger-text">{error}</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="faint" style={{ marginTop: 0, fontSize: 13 }}>
        Drag to reposition, and use the slider to zoom.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            position: 'relative',
            width: VIEW,
            height: VIEW,
            overflow: 'hidden',
            borderRadius: 8,
            touchAction: 'none',
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              width: VIEW,
              height: VIEW,
              display: 'block',
              cursor: drag.current ? 'grabbing' : 'grab',
              background: 'var(--bg-elev-2)',
            }}
          />
          {/* Circular guide: dims the square's corners outside the avatar circle. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
              border: '2px solid rgba(255,255,255,0.7)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center', marginTop: 14 }}>
        <span aria-hidden style={{ fontSize: 13 }}>
          🔍
        </span>
        <input
          type="range"
          min={minScale}
          max={minScale * MAX_MULT}
          step={minScale / 100}
          value={scale}
          onChange={(e) => applyScale(parseFloat(e.target.value))}
          style={{ flex: 1 }}
          aria-label="Zoom"
        />
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={confirm} disabled={!bitmap}>
          Use photo
        </button>
      </div>
    </div>
  )
}
