import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A small popover: a trigger button and a floating panel. Closes on an outside
 * press, on Escape, and when the content calls `close`. Used for the map
 * switcher, the overflow menu and the rail flyouts.
 */
export function BmMenu({
  trigger,
  label,
  className = '',
  panelClassName = '',
  buttonClassName = 'bm-btn',
  children,
  open: controlled,
  onOpenChange,
}: {
  trigger: ReactNode
  label: string
  className?: string
  panelClassName?: string
  buttonClassName?: string
  children: (close: () => void) => ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [inner, setInner] = useState(false)
  const open = controlled ?? inner
  const setOpen = (o: boolean) => {
    setInner(o)
    onOpenChange?.(o)
  }
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setInner(false)
        onOpenChange?.(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInner(false)
        onOpenChange?.(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  return (
    <div className={`bm-menu ${className}`} ref={ref}>
      <button
        type="button"
        className={`${buttonClassName}${open ? ' on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen(!open)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`bm-menu-panel ${panelClassName}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
