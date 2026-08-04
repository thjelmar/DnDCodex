import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchAll, type SearchResult } from '../lib/search'

// A Cmd/Ctrl+K command palette that searches every campaign and entity and
// navigates to the chosen result. Fully keyboard-driven: type to filter,
// up/down to move, Enter to open, Esc to close.

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus the input and reset state whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setActive(0)
      // Focus after paint so the autofocus lands reliably.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Debounced search as the query changes.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const t = setTimeout(async () => {
      const r = await searchAll(query)
      if (!cancelled) {
        setResults(r)
        setActive(0)
      }
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, open])

  const grouped = useMemo(() => results, [results])

  function choose(r: SearchResult | undefined) {
    if (!r) return
    onClose()
    navigate(r.to)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Keep the active row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  return (
    <div className="modal-backdrop" style={{ alignItems: 'flex-start', paddingTop: 90 }} onMouseDown={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 620, padding: 0, overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search"
      >
        <input
          ref={inputRef}
          className="input"
          style={{
            border: 'none',
            borderBottom: '1px solid var(--border)',
            borderRadius: 0,
            padding: '16px 18px',
            fontSize: 17,
          }}
          placeholder="Search campaigns, sessions, NPCs, notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />

        <div ref={listRef} style={{ maxHeight: 420, overflowY: 'auto' }}>
          {query.trim() === '' ? (
            <div className="faint" style={{ padding: 20, fontSize: 13 }}>
              Type to search everything. <kbd>↑</kbd> <kbd>↓</kbd> to navigate,{' '}
              <kbd>↵</kbd> to open, <kbd>Esc</kbd> to close.
            </div>
          ) : grouped.length === 0 ? (
            <div className="faint" style={{ padding: 20 }}>
              No matches for “{query}”.
            </div>
          ) : (
            grouped.map((r, i) => (
              <div
                key={r.key}
                data-idx={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r)}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  background: i === active ? 'var(--bg-elev-2)' : 'transparent',
                  borderLeft: i === active ? '3px solid var(--accent)' : '3px solid transparent',
                }}
              >
                <span style={{ fontSize: 18, lineHeight: '22px' }} aria-hidden>
                  {r.icon}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row between" style={{ gap: 8 }}>
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </span>
                    <span className="faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      {r.subtitle}
                    </span>
                  </div>
                  {r.snippet && (
                    <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.snippet}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
