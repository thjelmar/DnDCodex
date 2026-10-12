import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

// Shared by the campaign "list + editor" pages (NPCs, Locations, Notes,
// Sessions, Tables). On a wide screen the list and the detail editor sit side
// by side. On a phone there isn't room for both, so it shows one at a time: the
// list, or — once you pick something — the detail with a "back" bar to return.

const MOBILE_QUERY = '(max-width: 820px)'

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    onChange()
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}

export function MasterDetail({
  list,
  detail,
  selected,
  onBack,
  backLabel = 'Back to list',
  listWidth = 260,
}: {
  /** The list column: toolbar/filter, "new" button, and the rows. */
  list: ReactNode
  /** The detail column: the editor, or an empty-state placeholder. */
  detail: ReactNode
  /** Whether something is currently selected (controls the mobile view). */
  selected: boolean
  /** Clear the selection to return to the list (the mobile "back" action). */
  onBack: () => void
  /** Label for the mobile back bar, e.g. "All NPCs". */
  backLabel?: string
  /** Desktop width of the list column, in px. */
  listWidth?: number
}) {
  const mobile = useIsMobile()

  if (mobile) {
    if (selected) {
      return (
        <div className="md-detail">
          <button className="btn ghost small md-back" onClick={onBack}>
            <Icon name="arrow-left" size={14} color="inherit" /> {backLabel}
          </button>
          {detail}
        </div>
      )
    }
    return <div className="md-list">{list}</div>
  }

  return (
    <div className="master-detail" style={{ gridTemplateColumns: `${listWidth}px 1fr` }}>
      <div>{list}</div>
      <div>{detail}</div>
    </div>
  )
}
