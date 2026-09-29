import { useEffect, useState } from 'react'
import { useCampaign } from './CampaignLayout'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { getCampaignJoinCode, enableCampaignSharing } from '../auth/cloud'
import { PartyLoot } from '../components/PartyLoot'

// DM's "Loot" tab. The tracker is shared live with players, so the campaign must
// be registered for sharing first (which also makes the DM a member so RLS lets
// them read/write). If it isn't, offer to enable it — same as inviting players.
export function LootPage() {
  const campaign = useCampaign()
  const { user } = useAuth()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!supabase || !user) { setEnabled(false); return }
    getCampaignJoinCode(campaign.id).then((code) => {
      if (!cancelled) setEnabled(!!code)
    })
    return () => { cancelled = true }
  }, [campaign.id, user])

  async function enable() {
    if (!user) return
    setBusy(true)
    try {
      await enableCampaignSharing({ id: campaign.id, name: campaign.name }, user.id)
      setEnabled(true)
    } catch { /* surfaced by the disabled state staying */ }
    setBusy(false)
  }

  return (
    <div>
      <div className="row between" style={{ alignItems: 'baseline', marginBottom: 4 }}>
        <h2 className="mb-0" style={{ fontSize: 22 }}>
          <span aria-hidden style={{ marginRight: 8 }}>💰</span>Party Loot
        </h2>
      </div>
      <p className="faint" style={{ margin: '4px 0 16px' }}>
        A shared purse &amp; loot list your players see and edit live.
      </p>

      {!supabase || !user ? (
        <p className="faint">Sign in to use the shared party tracker.</p>
      ) : enabled === null ? (
        <p className="faint">Loading…</p>
      ) : !enabled ? (
        <div className="card" style={{ cursor: 'default', maxWidth: 460 }}>
          <p style={{ marginTop: 0 }}>
            The loot tracker is shared live with your players. Enable party sharing to start it.
          </p>
          <button className="btn primary" onClick={enable} disabled={busy}>
            {busy ? 'Enabling…' : 'Enable party sharing'}
          </button>
        </div>
      ) : (
        <PartyLoot cloudCampaignId={campaign.id} />
      )}
    </div>
  )
}
