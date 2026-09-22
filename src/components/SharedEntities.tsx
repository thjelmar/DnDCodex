import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getSharedEntities, type SharedEntityRow } from '../auth/cloud'
import { StatBlockView } from './StatBlockEditor'
import { Icon } from './Icon'
import type { RevealedSection } from '../lib/reveal'

// The player's live view of entities (NPCs, locations, notes, sessions, items)
// the DM has shared. Reads `shared_entities` (RLS restricts to members) and
// re-fetches on realtime changes. Renders the structured, reveal-safe snapshot
// as a consistent card — spoilered content was already stripped server-side.

const KIND_LABEL: Record<string, string> = {
  npc: 'NPC', location: 'Location', note: 'Note', session: 'Session', item: 'Item',
}
const CAPITALIZE_LABELS = new Set(['Disposition', 'Rarity', 'Type', 'Prosperity'])

export function SharedEntities({ linkedCampaignId }: { linkedCampaignId: string }) {
  const [items, setItems] = useState<SharedEntityRow[]>([])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const rows = await getSharedEntities(linkedCampaignId)
      if (!cancelled) setItems(rows)
    }
    refresh()
    if (!supabase) return
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
  }, [linkedCampaignId])

  if (items.length === 0) return null

  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="eye" size={18} />
        Shared with you
      </h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((it) => (
          <SharedCard key={it.id} row={it} />
        ))}
      </div>
    </div>
  )
}

function SharedCard({ row }: { row: SharedEntityRow }) {
  const d = row.data
  return (
    <div className="shared-entity-card">
      <div className="row" style={{ gap: 8, alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap' }}>
        <span className="shared-kind">{KIND_LABEL[d.kind] ?? d.kind}</span>
        <strong style={{ fontSize: 16 }}>{d.title}</strong>
        {d.subtitle && <span className="faint" style={{ fontSize: 13, textTransform: 'capitalize' }}>{d.subtitle}</span>}
        <span className="shared-pill">Shared with you</span>
      </div>
      {(d.sections ?? []).map((s) => (
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
    const labelled = section.label !== 'Description' && section.label !== 'Note' && section.label !== 'Recap'
    return (
      <div className="shared-section">
        {labelled && <div className="shared-section-label">{section.label}</div>}
        <div className="rte">
          <div className="rte-content" dangerouslySetInnerHTML={{ __html: section.html }} />
        </div>
      </div>
    )
  }
  return null
}
