import { BmIcon } from './BmIcon'
import { BmMenu } from './BmMenu'
import { TOKEN_KINDS } from '../../lib/tokenKind'
import type { TokenKind } from '../../db/types'

/** Which chip is on: every section, or one kind. */
export type KindFilter = 'all' | TokenKind

/** Chips under the filter field: All plus one per kind, each with its count. */
export function KindChips({
  counts,
  value,
  onChange,
}: {
  counts: Record<TokenKind, number>
  value: KindFilter
  onChange: (v: KindFilter) => void
}) {
  const total = TOKEN_KINDS.reduce((n, k) => n + counts[k.kind], 0)
  const chips: { id: KindFilter; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: total },
    ...TOKEN_KINDS.map((k) => ({ id: k.kind as KindFilter, label: k.chip, n: counts[k.kind] })),
  ]
  return (
    <div className="bm-kchips" role="group" aria-label="Filter by category">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`bm-kchip${value === c.id ? ' on' : ''}`}
          aria-pressed={value === c.id}
          onClick={() => onChange(c.id)}
        >
          {c.label}
          <small>{c.n}</small>
        </button>
      ))}
    </div>
  )
}

/**
 * A section header: a button that collapses the section, with its count, and a
 * menu of bulk actions. The caller supplies the actions.
 */
export function SectionHead({
  kind,
  title,
  count,
  collapsed,
  onToggle,
  onSelectAll,
  onHideAll,
  onShowAll,
}: {
  kind: TokenKind
  title: string
  count: number
  collapsed: boolean
  onToggle: () => void
  /** Offered only where tokens can be selected together (Enemies, for grouping). */
  onSelectAll?: () => void
  onHideAll: () => void
  onShowAll: () => void
}) {
  return (
    <div className="bm-group-head" data-kind={kind}>
      <button type="button" className="bm-group-toggle" aria-expanded={!collapsed} onClick={onToggle}>
        <span className={`bm-chev${collapsed ? ' shut' : ''}`} aria-hidden>
          <BmIcon name="chevron-down" size={14} />
        </span>
        <span className="bm-kind-dot" data-kind={kind} aria-hidden />
        <span className="bm-group-title">{title}</span>
        <span className="bm-group-count">{count}</span>
      </button>
      <BmMenu
        label={`${title} actions`}
        className="bm-group-menu"
        buttonClassName="bm-icon-btn"
        panelClassName="bm-menu-right"
        trigger={<BmIcon name="more" size={16} />}
      >
        {(close) => (
          <>
            {onSelectAll && (
              <button type="button" role="menuitem" className="bm-item" onClick={() => { onSelectAll(); close() }}>
                Select all for a group
              </button>
            )}
            <button type="button" role="menuitem" className="bm-item" onClick={() => { onHideAll(); close() }}>
              Hide all from players
            </button>
            <button type="button" role="menuitem" className="bm-item" onClick={() => { onShowAll(); close() }}>
              Show all to players
            </button>
          </>
        )}
      </BmMenu>
    </div>
  )
}
