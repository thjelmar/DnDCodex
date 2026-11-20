import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import type { Scene } from '../db/types'
import { libraryObjectUrl, useLibrary, useTemplateInCampaign, type LibraryTemplate } from '../lib/battleLibrary'
import { Modal } from './Modal'
import { formatBytes } from '../lib/image'

// Browse, search, preview, and copy battle map templates into a campaign. One
// component, two homes: the Tools page (pick a campaign) and the battle map's
// side panel (campaign fixed, `onUsed` selects the new scene).

type Size = 'any' | 'small' | 'medium' | 'large'
const SIZE_LABEL: Record<Size, string> = { any: 'Any size', small: 'Small', medium: 'Medium', large: 'Large' }

function sizeOf(t: LibraryTemplate): Exclude<Size, 'any'> {
  const squares = t.cols * t.rows
  return squares <= 400 ? 'small' : squares <= 900 ? 'medium' : 'large'
}

export function BattleLibrary({
  campaignId,
  onUsed,
}: {
  /** Fixed target campaign (battle map panel). Omit to show a campaign picker. */
  campaignId?: string
  onUsed?: (scene: Scene) => void
}) {
  const lib = useLibrary()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [size, setSize] = useState<Size>('any')
  const [open, setOpen] = useState<LibraryTemplate | null>(null)
  const [pick, setPick] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const campaigns = useLiveQuery(
    () => db.campaigns.toArray().then((cs) => cs.filter((c) => !c.archived && c.role !== 'player')),
    [],
  )
  const targetId = campaignId ?? (pick || campaigns?.[0]?.id || '')

  const templates: LibraryTemplate[] =
    lib.status === 'ready' ? lib.templates : lib.status === 'loading' || lib.status === 'offline' ? (lib.cached ?? []) : []

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of templates) for (const g of t.tags) counts.set(g, (counts.get(g) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g)
  }, [templates])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return templates.filter(
      (t) =>
        (!tag || t.tags.includes(tag)) &&
        (size === 'any' || sizeOf(t) === size) &&
        (!q || `${t.title} ${t.description} ${t.tags.join(' ')}`.toLowerCase().includes(q)),
    )
  }, [templates, query, tag, size])

  if (lib.status === 'unavailable') {
    return (
      <div className="empty" data-testid="library-unavailable">
        <div className="big">🗺️</div>
        <p>The map library isn't available in this build.</p>
        <p className="faint" style={{ fontSize: 13 }}>
          It needs the online backend, and it is hidden in the demo. Use the live site to browse maps.
        </p>
      </div>
    )
  }

  async function use(t: LibraryTemplate) {
    if (!targetId) {
      setError('Create a campaign first, then add the map to it.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const scene = await useTemplateInCampaign(t, targetId)
      setOpen(null)
      if (onUsed) onUsed(scene)
      else navigate(`/campaign/${targetId}/battlemap?sel=${scene.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that map.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="library" data-testid="library">
      {lib.status === 'offline' && (
        <p className="faint" role="status" style={{ fontSize: 13 }}>
          {templates.length
            ? "You're offline or the library didn't load. Showing the last list you saw."
            : "The library didn't load. Check your connection and "}
          <button className="btn ghost small" onClick={lib.reload}>Try again</button>
        </p>
      )}

      <div className="library-controls">
        <input
          className="input"
          type="search"
          placeholder="Search maps"
          aria-label="Search maps"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="select" aria-label="Map size" value={size} onChange={(e) => setSize(e.target.value as Size)}>
          {(Object.keys(SIZE_LABEL) as Size[]).map((s) => (
            <option key={s} value={s}>{SIZE_LABEL[s]}</option>
          ))}
        </select>
        {!campaignId && campaigns && campaigns.length > 0 && (
          <select
            className="select"
            aria-label="Add maps to campaign"
            value={targetId}
            onChange={(e) => setPick(e.target.value)}
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>Add to: {c.name}</option>
            ))}
          </select>
        )}
      </div>

      {allTags.length > 0 && (
        <div className="library-tags" role="group" aria-label="Filter by tag">
          {allTags.map((g) => (
            <button
              key={g}
              className={`tag library-tag${tag === g ? ' on' : ''}`}
              aria-pressed={tag === g}
              onClick={() => setTag(tag === g ? null : g)}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {lib.status === 'loading' && !templates.length && <p className="faint">Loading maps…</p>}
      {lib.status === 'ready' && templates.length === 0 && (
        <div className="empty">
          <div className="big">🗺️</div>
          <p>No maps are published yet. Check back soon.</p>
        </div>
      )}
      {templates.length > 0 && shown.length === 0 && <p className="faint">No maps match those filters.</p>}

      <div className="library-grid">
        {shown.map((t) => (
          <button key={t.id} className="library-card" onClick={() => setOpen(t)} data-testid="library-card">
            <img
              src={libraryObjectUrl(t.thumb_path)}
              alt=""
              loading="lazy"
              width={240}
              height={Math.round((240 * t.height) / t.width)}
            />
            <span className="library-card-body">
              <strong>{t.title}</strong>
              <span className="faint" style={{ fontSize: 12 }}>
                {t.cols} × {t.rows} squares
              </span>
              {t.credit && <span className="faint library-credit">Art: {t.credit}</span>}
            </span>
          </button>
        ))}
      </div>

      <p className="faint" style={{ fontSize: 12, marginTop: 16 }}>
        Maps are published by the site owner. If you think one shouldn't be here, use the bug report
        form in the sidebar to ask for its removal.
      </p>

      {open && (
        <Modal
          title={open.title}
          onClose={() => setOpen(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setOpen(null)}>Close</button>
              <button className="btn primary" disabled={busy} onClick={() => use(open)} data-testid="library-use">
                {busy ? 'Adding…' : 'Use in campaign'}
              </button>
            </>
          }
        >
          <div className="library-preview">
            <img src={libraryObjectUrl(open.thumb_path)} alt={`Preview of ${open.title}`} />
            {open.description && <p>{open.description}</p>}
            <p className="faint" style={{ fontSize: 13 }}>
              {open.cols} × {open.rows} squares · {open.width} × {open.height} px · {formatBytes(open.bytes)}
            </p>
            {open.tags.length > 0 && (
              <div className="library-tags">
                {open.tags.map((g) => (
                  <span key={g} className="tag">{g}</span>
                ))}
              </div>
            )}
            {(open.credit || open.license_note) && (
              <p className="faint" style={{ fontSize: 13 }}>
                {open.credit && (
                  <>
                    Art by{' '}
                    {open.credit_url ? (
                      <a href={open.credit_url} target="_blank" rel="noopener noreferrer">{open.credit}</a>
                    ) : (
                      open.credit
                    )}
                    .{' '}
                  </>
                )}
                {open.license_note}
              </p>
            )}
            {!campaignId && campaigns && campaigns.length === 0 && (
              <p className="faint">Create a campaign first. The map is copied into it.</p>
            )}
            {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
