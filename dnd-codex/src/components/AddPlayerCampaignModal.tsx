import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createCampaign } from '../db/repo'
import { Modal } from './Modal'

// Lets a player add a campaign they're playing in — just a name is needed. It
// creates a player-role campaign (kept out of the DM section) and opens its
// notes home.
export function AddPlayerCampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) setName('')
  }, [open])

  if (!open) return null

  async function create() {
    const campaign = await createCampaign({ name, role: 'player' })
    onClose()
    navigate(`/player/${campaign.id}`)
  }

  return (
    <Modal
      title="Add a campaign you're playing in"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={create}>
            Add
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Just the campaign's name to start — you can jot down your journal, character, quests, and
        more inside.
      </p>
      <div className="field">
        <label>Campaign name</label>
        <input
          className="input"
          autoFocus
          value={name}
          placeholder="e.g. Tuesday Night — Curse of Strahd"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
      </div>
    </Modal>
  )
}
