import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { supabase } from '../lib/supabase'
import { getInbox, markShareConsumed, type InboxShare } from './cloud'
import { importSharePacket, type SharePacket } from '../lib/share'

/**
 * Player-side inbox for a linked campaign: quests/notes the DM sent to this
 * account. Updates live via Supabase Realtime — a share the DM sends appears
 * here without a refresh. One click imports it into the player's sections + map.
 */
export function SharedInbox({ localCampaignId, linkedCampaignId }: { localCampaignId: string; linkedCampaignId: string }) {
  const { user } = useAuth()
  const [items, setItems] = useState<InboxShare[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) return
    setItems(await getInbox(linkedCampaignId))
  }, [user, linkedCampaignId])

  useEffect(() => {
    refresh()
    if (!supabase || !user) return
    // Live updates: any change to shares in this campaign re-pulls the inbox.
    // RLS still applies, so a player only ever receives their own shares.
    const channel = supabase
      .channel(`inbox-${linkedCampaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shares', filter: `campaign_id=eq.${linkedCampaignId}` },
        () => refresh(),
      )
      .subscribe()
    return () => {
      supabase!.removeChannel(channel)
    }
  }, [refresh, user, linkedCampaignId])

  if (!user || items.length === 0) return null

  async function importShare(s: InboxShare) {
    setBusy(s.id)
    try {
      await importSharePacket(localCampaignId, s.payload as SharePacket)
      await markShareConsumed(s.id)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      style={{
        marginBottom: 24,
        border: '1px solid var(--accent)',
        borderRadius: 'var(--radius)',
        padding: 14,
        background: 'var(--bg-elev)',
      }}
    >
      <h2 className="mb-0" style={{ fontSize: 18, marginBottom: 10 }}>
        📥 Shared with you <span className="faint" style={{ fontSize: 14 }}>{items.length}</span>
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((s) => (
          <div key={s.id} className="row between" style={{ gap: 10, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div className="title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title || 'Shared items'}
              </div>
              <div className="faint" style={{ fontSize: 12 }}>from {s.fromName}</div>
            </div>
            <button className="btn small primary" disabled={busy === s.id} onClick={() => importShare(s)}>
              {busy === s.id ? 'Adding…' : 'Add to my notes'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
