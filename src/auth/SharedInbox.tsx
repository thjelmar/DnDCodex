import { useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { getInbox, markShareConsumed, type InboxShare } from './cloud'
import { importSharePacket, type SharePacket } from '../lib/share'

/**
 * Player-side inbox for a linked campaign: quests/notes the DM sent to this
 * account. One click imports a share into the player's sections + map, then it
 * drops out of the list.
 */
export function SharedInbox({ localCampaignId, linkedCampaignId }: { localCampaignId: string; linkedCampaignId: string }) {
  const { user } = useAuth()
  const [items, setItems] = useState<InboxShare[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  async function refresh() {
    setItems(await getInbox(linkedCampaignId))
  }
  useEffect(() => {
    if (user) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, linkedCampaignId])

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
