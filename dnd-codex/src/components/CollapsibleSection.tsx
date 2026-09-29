import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { useCollapsed } from '../lib/useCollapsed'

/**
 * A player-home section with a collapsible body and remembered state. The label
 * + chevron is the toggle; `headerRight` (filters, add buttons) stays clickable
 * beside it without toggling. Collapsed state persists per browser.
 */
export function CollapsibleSection({
  storageKey,
  defaultOpen = true,
  icon,
  label,
  count,
  headerRight,
  children,
}: {
  storageKey: string
  defaultOpen?: boolean
  icon?: ReactNode
  label: string
  count?: number
  headerRight?: ReactNode
  children: ReactNode
}) {
  const [open, toggle] = useCollapsed(storageKey, defaultOpen)
  return (
    <div className="psec">
      <div className="psec-head">
        <button className="psec-toggle" onClick={toggle} aria-expanded={open}>
          <Icon name="chevron-right" size={13} color="currentColor" className={`psec-chev${open ? ' open' : ''}`} />
          {icon != null && <span aria-hidden className="psec-icon">{icon}</span>}
          <span className="psec-label">{label}</span>
          {count != null && count > 0 && <span className="psec-count">{count}</span>}
        </button>
        {headerRight && <div className="psec-actions">{headerRight}</div>}
      </div>
      {open && <div className="psec-body">{children}</div>}
    </div>
  )
}
