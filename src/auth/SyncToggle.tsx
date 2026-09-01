import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAuth } from './AuthProvider'
import { optOutOfSync, optInToSync } from '../lib/sync'

/**
 * Compact per-campaign sync control for the campaign header. Signed-in users sync
 * every campaign they own by default; this keeps a specific one LOCAL to this
 * browser instead. Opting out keeps any existing cloud copy (just stops updating
 * it here); opting back in re-uploads and resumes live sync. The preference is
 * per-device and never itself synced. Hidden unless signed in.
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

  const tip = optedOut
    ? 'Kept on this device only. Click to sync this campaign to your account across devices.'
    : 'Syncing to your account across devices. Click to keep this campaign local to this browser.'

  return (
    <label
      className="row"
      title={tip}
      style={{
        gap: 6,
        alignItems: 'center',
        cursor: busy ? 'default' : 'pointer',
        fontSize: 13,
        color: 'var(--text-dim)',
        whiteSpace: 'nowrap',
      }}
    >
      <input type="checkbox" checked={!optedOut} disabled={busy} onChange={toggle} />
      <span>{busy ? 'Sync…' : optedOut ? '⛅ Local only' : '☁️ Sync'}</span>
      {error && (
        <span className="danger-text" title={error} aria-label={error}>
          ⚠️
        </span>
      )}
    </label>
  )
}
