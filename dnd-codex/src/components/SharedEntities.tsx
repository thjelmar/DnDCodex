import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { getSharedEntities, type SharedEntityRow } from '../auth/cloud'
import { StatBlockView } from './StatBlockEditor'
import type { RevealedSection } from '../lib/reveal'

// The player's live view of entities (NPCs, locations, notes, sessions, items)
// the DM has shared. Reads `shared_entities` (RLS restricts to members) and
// re-fetches on realtime changes. Renders the structured, reveal-safe snapshot
// as a consistent card — spoilered content was already stripped server-side.

const KIND_LABEL: Record<string, string> = {
  npc: 'NPC', location: 'Location', note: 'Note', session: 'Session', item: 'Item',
}
const CAPITALIZE_LABELS = new Set(['Disposition', 'Rarity', 'Type', 'Prosperity'])

/** Live subscription to the entities a DM has shared with this linked campaign.
 *  Re-fetches on any realtime change to `shared_entities`. */
export function useSharedEntities(linkedCampaignId: string | null | undefined): SharedEntityRow[] {
  const [items, setItems] = useState<SharedEntityRow[]>([])
  // A Realtime channel binds its postgres_changes RLS at JOIN time using the
  // websocket's current token. linkedCampaignId comes from local Dexie and is
  // ready before the async session restore, so joining then would bind the
  // subscription as anon — RLS (is_member) silently drops every event, and a
  // later setAuth does NOT re-run the join. Gate the channel on the access token
  // so it only joins once the socket carries the authenticated user's JWT, and
  // re-key on the token so a sign-in (or refresh) re-joins with a fresh RLS ctx.
  const { session } = useAuth()
  const token = session?.access_token ?? null

  useEffect(() => {
    if (!linkedCampaignId) {
      setItems([])
      return
    }
    let cancelled = false
    const refresh = async () => {
      const rows = await getSharedEntities(linkedCampaignId)
      if (!cancelled) setItems(rows)
    }
    refresh()
    if (!supabase || !token) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 300)
    }
    const channel = supabase
      .channel(`shared-entities-${linkedCampaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_entities', filter: `campaign_id=eq.${linkedCampaignId}` },
        schedule,
      )
      .subscribe()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      supabase!.removeChannel(channel)
    }
  }, [linkedCampaignId, token])

  return items
}

export function SharedCard({ row }: { row: SharedEntityRow }) {
  const d = row.data
  const subtitle = d.subtitle?.trim() ?? ''
  // The subtitle already shows this value beside the name (an NPC's role, a
  // location's type…), so drop the matching overview field to avoid repeating
  // it — and drop the overview section entirely if that leaves it empty.
  const sections = (d.sections ?? [])
    .map((s) =>
      s.fields
        ? { ...s, fields: s.fields.filter((f) => f.value.trim().toLowerCase() !== subtitle.toLowerCase()) }
        : s,
    )
    .filter((s) => !s.fields || s.fields.length > 0)
  // The portrait sits to the left of the name/role and the description subheader;
  // the description reads as the title's subheader, so it stays right under the
  // name. Every other section flows full-width beneath.
  const portrait = sections.find((s) => s.key === 'portrait')
  const description = sections.find((s) => s.key === 'description')
  const rest = sections.filter((s) => s.key !== 'portrait' && s.key !== 'description')
  return (
    <div className="shared-entity-card">
      <div className="shared-card-top">
        {portrait?.image?.dataUrl && (
          <img className="shared-portrait" src={portrait.image.dataUrl} alt={portrait.image.alt || d.title} />
        )}
        <div className="shared-card-headwrap">
          <div className="shared-card-head">
            <span className="shared-kind">{KIND_LABEL[d.kind] ?? d.kind}</span>
            <strong className="shared-title">{d.title}</strong>
            {subtitle && <span className="shared-subtitle">{subtitle}</span>}
            <span className="shared-pill">Shared with you</span>
          </div>
          {description && <SharedSection section={description} title={d.title} />}
        </div>
      </div>
      {rest.map((s) => (
        <SharedSection key={s.key} section={s} title={d.title} />
      ))}
    </div>
  )
}

function SharedSection({ section, title }: { section: RevealedSection; title: string }) {
  if (section.fields) {
    return (
      <div className="shared-section shared-fields">
        {section.fields.map((f) => (
          <div key={f.label} className="shared-field">
            <span className="shared-field-label">{f.label}</span>{' '}
            <span style={{ textTransform: CAPITALIZE_LABELS.has(f.label) ? 'capitalize' : 'none' }}>{f.value}</span>
          </div>
        ))}
      </div>
    )
  }
  if (section.statBlock) {
    return (
      <div className="shared-section">
        <StatBlockView
          name={title}
          block={section.statBlock.block}
          hideAbilities={section.statBlock.hideAbilities}
          hidden={section.statBlock.hidden}
        />
      </div>
    )
  }
  if (section.html != null) {
    // Description reads as the title's subheader (italic, slightly smaller);
    // Note/Recap are the body; everything else keeps a labelled heading.
    const isDescription = section.label === 'Description'
    const labelled = section.label !== 'Description' && section.label !== 'Note' && section.label !== 'Recap'
    return (
      <div className={`shared-section${isDescription ? ' shared-subheader' : ''}`}>
        {labelled && <div className="shared-section-label">{section.label}</div>}
        <div className="rte">
          <div className="rte-content" dangerouslySetInnerHTML={{ __html: section.html }} />
        </div>
      </div>
    )
  }
  return null
}
