import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { joinCampaignByCode } from './cloud'
import { findOrCreateLinkedPlayerCampaign } from '../db/repo'

/**
 * Player-side: enter the join code a DM shared to link this account to their
 * campaign. Once joined, the DM can share quests/notes straight to your inbox.
 */
export function JoinCampaignModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState<{ name: string; localId: string } | null>(null)

  async function join() {
    if (!code.trim()) return
    setBusy(true)
    setError('')
    try {
      const { campaignId, name } = await joinCampaignByCode(code)
      // Give the joined campaign a local home so shares can land in it.
      const local = await findOrCreateLinkedPlayerCampaign(campaignId, name)
      setJoined({ name, localId: local.id })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join.')
    } finally {
      setBusy(false)
    }
  }

  function openCampaign() {
    if (joined) {
      onClose()
      navigate(`/player/${joined.localId}`)
    }
  }

  return (
    <Modal
      title="Join a campaign"
      onClose={onClose}
      footer={
        joined ? (
          <button className="btn primary" onClick={openCampaign}>
            Open it
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
          ✓ You've joined <strong>{joined.name}</strong>. It's now in your Player list, and anything your DM
          shares will appear there in <strong>Shared with you</strong>.
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
