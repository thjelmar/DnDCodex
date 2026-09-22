import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getSharedEntities, type SharedEntityRow } from '../auth/cloud'

// The player's live view of entities (NPCs, locations, notes, sessions, items)
// the DM has shared. Reads `shared_entities` directly (RLS restricts to members)
// and re-fetches on realtime changes, so pushes and un-shares reflect live. The
// body is the DM's reveal-safe HTML with spoilers already redacted server-side.

const KIND_ICON: Record<string, string> = {
  npc: '🧑', location: '🗺️', note: '📝', session: '📅', item: '⚔️',
}
const KIND_LABEL: Record<string, string> = {
  npc: 'NPC', location: 'Location', note: 'Note', session: 'Session', item: 'Item',
}

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
      <h2 style={{ fontSize: 18, marginBottom: 10 }}>
        <span aria-hidden style={{ marginRight: 8 }}>📖</span>
        Shared with you
      </h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((it) => (
          <div key={it.id} className="shared-entity-card">
            <div className="row" style={{ gap: 8, alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap' }}>
              <span className="shared-kind">
                {KIND_ICON[it.kind] ?? '•'} {KIND_LABEL[it.kind] ?? it.kind}
              </span>
              <strong style={{ fontSize: 16 }}>{it.data.title}</strong>
              {it.data.subtitle && (
                <span className="faint" style={{ fontSize: 13, textTransform: 'capitalize' }}>{it.data.subtitle}</span>
              )}
            </div>
            {/* Body is the DM's reveal-safe HTML (spoilers already redacted). */}
            <div className="rte">
              <div className="rte-content" dangerouslySetInnerHTML={{ __html: it.data.body || '' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
