import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

// A right-side detail drawer used for reading/editing a single entity. Unlike a
// centered Modal it sits against the edge, can be dragged wider/narrower, and
// toggles full-screen. The chosen width is remembered per browser. Near
// drop-in for <Modal> — same title/onClose/children/footer props.

const MIN_W = 340
const STORAGE_KEY = 'codex.sidePanelWidth'

function loadWidth(): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY))
    if (v >= MIN_W) return v
  } catch {
    /* ignore */
  }
  return 480
}

export function SidePanel({
  title,
  onClose,
  children,
  footer,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const [width, setWidth] = useState<number>(loadWidth)
  const [full, setFull] = useState(false)
  const dragging = useRef(false)
  const widthRef = useRef(width)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  // Drag-to-resize: track the pointer while a drag is active, clamp to the
  // viewport, and persist the final width. Listeners mount once; the live width
  // lives in a ref so mouseup always persists the latest value.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const max = window.innerWidth - 120
      const w = Math.min(max, Math.max(MIN_W, window.innerWidth - e.clientX))
      widthRef.current = w
      setWidth(w)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      try {
        localStorage.setItem(STORAGE_KEY, String(widthRef.current))
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startDrag = () => {
    dragging.current = true
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }

  return (
    <div className="sidepanel-root">
      <div className="sidepanel-scrim" onMouseDown={onClose} />
      <aside
        className={`sidepanel${full ? ' full' : ''}`}
        style={full ? undefined : { width }}
        role="dialog"
        aria-modal="true"
      >
        {!full && (
          <div className="sidepanel-resize" onMouseDown={startDrag} title="Drag to resize" aria-hidden />
        )}
        <div className="sidepanel-head">
          <h2 className="sidepanel-title">{title}</h2>
          <div className="row" style={{ gap: 2 }}>
            <button
              className="btn ghost small icon-only"
              onClick={() => setFull((f) => !f)}
              title={full ? 'Exit full screen' : 'Full screen'}
              aria-label={full ? 'Exit full screen' : 'Full screen'}
            >
              <Icon name={full ? 'minimize' : 'maximize'} size={16} />
            </button>
            <button
              className="btn ghost small icon-only"
              onClick={onClose}
              title="Close"
              aria-label="Close"
            >
              <Icon name="x" size={17} />
            </button>
          </div>
        </div>
        <div className="sidepanel-body">{children}</div>
        {footer && <div className="sidepanel-foot">{footer}</div>}
      </aside>
    </div>
  )
}
