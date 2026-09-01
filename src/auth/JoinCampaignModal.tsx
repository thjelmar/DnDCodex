import { useState } from 'react'
import { Modal } from '../components/Modal'
import { joinCampaignByCode } from './cloud'

/**
 * Player-side: enter the join code a DM shared to link this account to their
 * campaign. Once joined, the DM can share quests/notes straight to your inbox.
 */
export function JoinCampaignModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState<string | null>(null)

  async function join() {
    if (!code.trim()) return
    setBusy(true)
    setError('')
    try {
      const { name } = await joinCampaignByCode(code)
      setJoined(name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Join a campaign"
      onClose={onClose}
      footer={
        joined ? (
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || !code.trim()} onClick={join}>
              {busy ? 'Joining…' : 'Join'}
            </button>
          </>
        )
      }
    >
      {joined ? (
        <p>
          ✓ You've joined <strong>{joined}</strong>. Your DM can now share quests and notes straight to
          you — they'll show up here.
        </p>
      ) : (
        <>
          <p className="faint" style={{ marginTop: 0 }}>
            Enter the join code your DM gave you (from their campaign's <strong>Invite players</strong>).
          </p>
          <input
            className="input"
            autoFocus
            value={code}
            placeholder="e.g. 7KQP2M"
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setError('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            style={{ width: '100%', textTransform: 'uppercase', letterSpacing: 2, fontFamily: 'monospace' }}
          />
          {error && <div className="danger-text" style={{ fontSize: 13, marginTop: 6 }}>{error}</div>}
        </>
      )}
    </Modal>
  )
}
