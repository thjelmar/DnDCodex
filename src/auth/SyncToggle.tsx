import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAuth } from './AuthProvider'
import { optOutOfSync, optInToSync } from '../lib/sync'

/**
 * Per-campaign sync control, shown on the campaign overview when signed in.
 * Signed-in users sync every campaign they own by default; this lets them keep a
 * specific campaign LOCAL to this browser instead. Opting out keeps any existing
 * cloud copy (it just stops updating it here); opting back in re-uploads and
 * resumes live sync. The preference is per-device and never itself synced.
 */
export function SyncToggle({ campaign }: { campaign: { id: string; name: string } }) {
  const { configured, user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // undefined while loading or when absent → treated as "not opted out" (synced).
  const optedOut = useLiveQuery(
    () => db.syncOptOut.get(campaign.id).then(Boolean),
    [campaign.id],
    false,
  )

  if (!configured || !user) return null

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      if (optedOut) await optInToSync(campaign, user!.id)
      else await optOutOfSync(campaign.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change sync.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="sidebar-heading" style={{ margin: '0 0 8px' }}>Sync</div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <label className="row" style={{ gap: 8, alignItems: 'center', cursor: busy ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={!optedOut} disabled={busy} onChange={toggle} />
          <span style={{ fontSize: 13.5 }}>
            {busy ? 'Updating…' : optedOut ? '⛅ Kept on this device only' : '☁️ Syncing to your account'}
          </span>
        </label>
        <span className="faint" style={{ fontSize: 12 }}>
          {optedOut
            ? 'This campaign stays in this browser. Any existing cloud copy is kept but not updated here.'
            : 'This campaign syncs to your account and follows you across devices.'}
        </span>
      </div>
      {error && <div className="danger-text" style={{ fontSize: 13, marginTop: 6 }}>{error}</div>}
    </div>
  )
}
