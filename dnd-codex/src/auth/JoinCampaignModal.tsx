import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { joinCampaignByCode, previewCampaignByCode, type CampaignPreview } from './cloud'
import { findOrCreateLinkedPlayerCampaign } from '../db/repo'

/**
 * Player-side: enter the join code a DM shared to link this account to their
 * campaign. Before joining, it previews the campaign and DM so the player can
 * confirm they're joining the right one, then links the account on confirm.
 */
export function JoinCampaignModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'enter' | 'confirm' | 'joined'>('enter')
  const [preview, setPreview] = useState<CampaignPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState<{ name: string; localId: string } | null>(null)

  // Step 1 -> 2: look up the campaign + DM behind the code to confirm.
  async function lookUp() {
    if (!code.trim()) return
    setBusy(true)
    setError('')
    try {
      const p = await previewCampaignByCode(code)
      if (!p) {
        setError('No campaign has that code. Double-check it with your DM.')
      } else {
        setPreview(p)
        setStep('confirm')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not look up that code.')
    } finally {
      setBusy(false)
    }
  }

  // Step 2 -> 3: actually join, and give the campaign a local home for shares.
  async function join() {
    setBusy(true)
    setError('')
    try {
      const { campaignId, name } = await joinCampaignByCode(code)
      const local = await findOrCreateLinkedPlayerCampaign(campaignId, name)
      setJoined({ name, localId: local.id })
      setStep('joined')
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

  const footer =
    step === 'joined' ? (
      <button className="btn primary" onClick={openCampaign}>
        Open it
      </button>
    ) : step === 'confirm' ? (
      <>
        <button className="btn ghost" onClick={() => { setStep('enter'); setError('') }} disabled={busy}>
          Back
        </button>
        <button className="btn primary" onClick={join} disabled={busy}>
          {busy ? 'Joining…' : 'Join campaign'}
        </button>
      </>
    ) : (
      <>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy || !code.trim()} onClick={lookUp}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </>
    )

  return (
    <Modal title="Join a campaign" onClose={onClose} footer={footer}>
      {step === 'joined' ? (
        <p>
          ✓ You've joined <strong>{joined?.name}</strong>. It's now in your Player list, and anything your DM
          shares will appear there in <strong>Shared with you</strong>.
        </p>
      ) : step === 'confirm' ? (
        <>
          <p className="faint" style={{ marginTop: 0 }}>You're about to join:</p>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600 }}>{preview?.name}</div>
            <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
              Run by <strong style={{ color: 'var(--text-dim)' }}>{preview?.dmName}</strong>
            </div>
          </div>
          <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
            Make sure this is the right campaign before linking your account.
          </p>
          {error && <div className="danger-text" style={{ fontSize: 13, marginTop: 8 }}>{error}</div>}
        </>
      ) : (
        <>
          <p className="faint" style={{ marginTop: 0 }}>
            Enter the join code your DM gave you (from their campaign's <strong>Invite players</strong>),
            or open the invite link they shared.
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
            onKeyDown={(e) => e.key === 'Enter' && lookUp()}
            style={{ width: '100%', textTransform: 'uppercase', letterSpacing: 2, fontFamily: 'monospace' }}
          />
          {error && <div className="danger-text" style={{ fontSize: 13, marginTop: 6 }}>{error}</div>}
        </>
      )}
    </Modal>
  )
}
