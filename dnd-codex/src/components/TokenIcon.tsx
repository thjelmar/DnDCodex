import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TOKEN_ICON_CATALOG, isTokenIcon, tokenIconLabel, useTokenIconPaths } from '../lib/tokenIcons'

/** A bundled game-icons.net glyph as plain HTML-hosted SVG, colored by
 *  `currentColor`. Renders an empty box until the glyph chunk loads. */
export function TokenIcon({ id, size = 24 }: { id: string; size?: number }) {
  const paths = useTokenIconPaths()
  const d = paths?.[id]?.d
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      {d && <path d={d} fill="currentColor" />}
    </svg>
  )
}

/** Picker for a token icon: "Automatic" (keyword pick) or any bundled glyph. */
export function TokenIconPicker({
  value,
  autoId,
  onChange,
}: {
  /** The saved override, or null/undefined for automatic. */
  value: string | null | undefined
  /** What automatic currently resolves to (null = initials). */
  autoId: string | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return TOKEN_ICON_CATALOG.filter(([id, label]) => !needle || label.toLowerCase().includes(needle) || id.includes(needle))
  }, [q])
  const current = isTokenIcon(value) ? value : null
  const effective = current ?? autoId
  return (
    <div className="field token-icon-field">
      <label>Token icon</label>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span className="token-icon-preview" aria-hidden="true">
          {effective ? <TokenIcon id={effective} size={28} /> : <span className="faint">Aa</span>}
        </span>
        <span className="faint" style={{ fontSize: 12, flex: 1 }}>
          {current ? tokenIconLabel(current) : autoId ? `Automatic (${tokenIconLabel(autoId)})` : 'Automatic'}
        </span>
        <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Done' : 'Change'}
        </button>
        {current && (
          <button type="button" className="btn btn-sm" onClick={() => onChange(null)}>
            Use automatic
          </button>
        )}
      </div>
      {open && (
        <div className="token-icon-panel">
          <input className="input" placeholder="Search icons…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search token icons" />
          <div className="token-icon-grid" role="listbox" aria-label="Token icons">
            {shown.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={current === id}
                className={`token-icon-opt${current === id ? ' selected' : ''}`}
                title={label}
                aria-label={label}
                onClick={() => onChange(id)}
              >
                <TokenIcon id={id} size={28} />
              </button>
            ))}
            {shown.length === 0 && <span className="faint">No icons match.</span>}
          </div>
          <div className="faint" style={{ fontSize: 11 }}>
            Icons from <Link to="/credits">game-icons.net</Link> (CC BY 3.0).
          </div>
        </div>
      )}
    </div>
  )
}
