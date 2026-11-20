import { Modal } from './Modal'
import type { Campaign } from '../db/types'

// Campaign-level actions that used to sit at the bottom of the Overview as a
// danger zone. Opened from the "Campaign settings" button on the hero.

export function CampaignSettingsModal({
  campaign,
  onClose,
  onToggleArchive,
  onDelete,
}: {
  campaign: Campaign
  onClose: () => void
  onToggleArchive: () => void
  onDelete: () => void
}) {
  return (
    <Modal
      title="Campaign settings"
      onClose={onClose}
      footer={
        <button className="btn ghost" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="field">
        <label>{campaign.archived ? 'Archived' : 'Archive'}</label>
        <p className="muted" style={{ marginTop: 0 }}>
          {campaign.archived
            ? 'This campaign is archived. Unarchiving brings it back; you can then set a new session date.'
            : 'Archiving ends the campaign and clears its shared session calendar. You can unarchive anytime.'}
        </p>
        <button className="btn" onClick={onToggleArchive}>
          {campaign.archived ? 'Unarchive' : 'Archive'} campaign
        </button>
      </div>
      <div className="field">
        <label>Delete</label>
        <p className="muted" style={{ marginTop: 0 }}>
          Permanently deletes the campaign and everything in it. Export a backup first.
        </p>
        <button className="btn danger" onClick={onDelete}>
          Delete campaign
        </button>
      </div>
    </Modal>
  )
}
