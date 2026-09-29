import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCampaign } from './CampaignLayout'
import {
  loadTaggedEntities,
  aggregateTags,
  KIND_LABEL,
  type TaggedEntity,
  type TaggedKind,
} from '../lib/entities'

const KIND_ORDER: TaggedKind[] = ['note', 'npc', 'location', 'item', 'session', 'rolltable']

export function TagsPage() {
  const campaign = useCampaign()
  const [searchParams] = useSearchParams()
  const activeTag = searchParams.get('tag')

  const entities = useLiveQuery(() => loadTaggedEntities(campaign.id), [campaign.id])

  if (!entities) return <div className="faint">Loading…</div>

  const tagCounts = aggregateTags(entities)

  // ---- All-tags view --------------------------------------------------------
  if (!activeTag) {
    return (
      <div>
        <p className="muted" style={{ marginTop: 0 }}>
          Tag any entity to organize your campaign. Click a tag to see everything under it.
        </p>
        {tagCounts.length === 0 ? (
          <div className="empty">
            <div className="big">🏷️</div>
            <p>No tags yet. Add tags to notes, NPCs, locations, items, sessions, or tables.</p>
          </div>
        ) : (
          <div className="row wrap" style={{ gap: 10 }}>
            {tagCounts.map(({ tag, count }) => (
              <Link
                key={tag}
                to={`?tag=${encodeURIComponent(tag)}`}
                className="tag"
                style={{ textDecoration: 'none', fontSize: 15, padding: '6px 12px' }}
              >
                #{tag} <span className="faint">{count}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ---- Single-tag view ------------------------------------------------------
  const matches = entities.filter((e) => e.tags.includes(activeTag))
  const byKind = new Map<TaggedKind, TaggedEntity[]>()
  for (const e of matches) {
    if (!byKind.has(e.kind)) byKind.set(e.kind, [])
    byKind.get(e.kind)!.push(e)
  }

  return (
    <div>
      <div className="row between" style={{ marginBottom: 18 }}>
        <h2 className="mb-0">
          <span className="faint">#</span>
          {activeTag}
          <span className="faint" style={{ fontSize: 14, marginLeft: 8 }}>
            {matches.length} item{matches.length === 1 ? '' : 's'}
          </span>
        </h2>
        <Link to="?" className="btn ghost small">
          ← All tags
        </Link>
      </div>

      {matches.length === 0 ? (
        <div className="empty">
          <p>Nothing is tagged “{activeTag}” anymore.</p>
        </div>
      ) : (
        KIND_ORDER.filter((k) => byKind.has(k)).map((kind) => (
          <div key={kind} style={{ marginBottom: 22 }}>
            <div className="sidebar-heading" style={{ margin: '0 0 8px' }}>
              {KIND_LABEL[kind]}
            </div>
            {byKind.get(kind)!.map((e) => (
              <Link
                key={e.id}
                to={e.to}
                className="list-row"
                style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}
              >
                <div className="title">
                  {e.icon} {e.name}
                </div>
                {e.tags.length > 1 && (
                  <span className="faint" style={{ fontSize: 11 }}>
                    {e.tags.filter((t) => t !== activeTag).map((t) => `#${t}`).join(' ')}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
