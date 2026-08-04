import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { loadTaggedEntities, aggregateTags } from '../lib/entities'
import type { Id } from '../db/types'

/** Live list of all tags used anywhere in the campaign (for autocomplete). */
export function useCampaignTags(campaignId: Id): string[] {
  return (
    useLiveQuery(
      async () => aggregateTags(await loadTaggedEntities(campaignId)).map((t) => t.tag),
      [campaignId],
    ) ?? []
  )
}

function normalize(raw: string): string {
  // Collapse whitespace; tags are compared case-sensitively but trimmed.
  return raw.replace(/\s+/g, ' ').trim()
}

/**
 * An editable list of tags: existing tags render as removable chips, and a text
 * field adds new ones on Enter or comma. Suggestions come from the rest of the
 * campaign so tags stay consistent instead of fragmenting.
 */
export function TagInput({
  campaignId,
  tags,
  onChange,
}: {
  campaignId: Id
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const suggestions = useCampaignTags(campaignId)
  const listId = useId()

  /** Adds one or more tags (splitting on commas), de-duplicating. */
  const add = (raw: string) => {
    const fresh = raw
      .split(',')
      .map(normalize)
      .filter((t) => t && !tags.includes(t))
    if (fresh.length) onChange([...tags, ...new Set(fresh)])
  }
  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag))

  return (
    <div
      className="row wrap"
      style={{
        gap: 6,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '7px 9px',
        background: 'var(--bg)',
      }}
    >
      {tags.map((tag) => (
        <span key={tag} className="tag" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          #{tag}
          <button
            onClick={() => remove(tag)}
            aria-label={`Remove ${tag}`}
            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 0, fontSize: 13 }}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        value={draft}
        list={listId}
        placeholder={tags.length ? 'Add tag…' : 'Add tags (Enter or comma)…'}
        onChange={(e) => {
          // A comma commits everything before the last comma; the rest stays
          // in the field. Handles fast typing / paste that delivers several
          // commas in a single change event.
          const v = e.target.value
          const lastComma = v.lastIndexOf(',')
          if (lastComma >= 0) {
            add(v.slice(0, lastComma))
            setDraft(v.slice(lastComma + 1))
          } else {
            setDraft(v)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(draft)
            setDraft('')
          } else if (e.key === 'Backspace' && draft === '' && tags.length) {
            remove(tags[tags.length - 1])
          }
        }}
        onBlur={() => {
          if (draft) {
            add(draft)
            setDraft('')
          }
        }}
        style={{
          flex: 1,
          minWidth: 120,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--text)',
          padding: '2px 0',
        }}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  )
}

/** Read-only tag chips that link to the campaign's tag browser. */
export function TagChips({
  campaignId,
  tags,
  size = 'normal',
}: {
  campaignId: Id
  tags: string[]
  size?: 'normal' | 'small'
}) {
  if (!tags?.length) return null
  return (
    <span className="row wrap" style={{ gap: 6 }}>
      {tags.map((tag) => (
        <Link
          key={tag}
          to={`/campaign/${campaignId}/tags?tag=${encodeURIComponent(tag)}`}
          className="tag"
          onClick={(e) => e.stopPropagation()}
          style={{ textDecoration: 'none', fontSize: size === 'small' ? 11 : undefined }}
        >
          #{tag}
        </Link>
      ))}
    </span>
  )
}
