import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

// An Overview panel with a heading that toggles it open or closed. Wide screens
// show it open; on a phone the less-used panels start closed so the page stays
// one short stack. The default is read once, at mount. The heading is an <h3>
// that wraps the toggle button, so the panel keeps its place in the heading outline.

const WIDE = '(min-width: 961px)'

export function CollapsePanel({
  title,
  defaultOpenWide = true,
  defaultOpenPhone = false,
  actions,
  children,
}: {
  title: string
  defaultOpenWide?: boolean
  defaultOpenPhone?: boolean
  /** Controls that sit beside the heading (for example an Edit button). */
  actions?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => {
    try {
      return window.matchMedia(WIDE).matches ? defaultOpenWide : defaultOpenPhone
    } catch {
      return defaultOpenWide
    }
  })
  const bodyId = useId()
  return (
    <section className="ov-panel">
      <div className="ov-panel-head">
        <h3 className="mb-0">
          <button
            type="button"
            className="ov-panel-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon
              name="chevron-right"
              size={13}
              color="currentColor"
              className={`sidebar-caret${open ? ' open' : ''}`}
            />
            {title}
          </button>
        </h3>
        {actions}
      </div>
      {/* Stays mounted while closed (hidden), so aria-controls always resolves and
          text typed into a panel survives a close. */}
      <div id={bodyId} className="ov-panel-body" hidden={!open}>
        {children}
      </div>
    </section>
  )
}
