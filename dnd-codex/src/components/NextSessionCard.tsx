import { useState } from 'react'
import { Icon } from './Icon'
import { SessionStatusBadge } from './SessionStatusBadge'
import { SessionPlanner } from './SessionPlanner'
import { useAuth } from '../auth/AuthProvider'
import { sessionStatus } from '../lib/sessionStatus'
import type { Campaign } from '../db/types'

// DM control for the next-session schedule on the campaign overview. The box is a
// button that opens the planner (month calendar to pick the date, copy-calendar
// link, and the RSVP tally). Writes the campaign's local fields (works offline,
// local-first) and mirrors to the cloud so players see it live.

export function NextSessionCard({ campaign }: { campaign: Campaign }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const status = sessionStatus(campaign, false)

  return (
    <div className="next-session">
      <button className="next-session-trigger" onClick={() => setOpen(true)}>
        <span className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
          <span className="next-session-label">Next session</span>
          <SessionStatusBadge status={status} />
        </span>
        <span className="next-session-cta">
          <Icon name={campaign.nextSessionDate ? 'pencil' : 'plus'} size={13} />
          {campaign.nextSessionDate ? 'Manage' : 'Set date'}
        </span>
      </button>

      {open && (
        <SessionPlanner
          mode="dm"
          campaign={campaign}
          cloudCampaignId={campaign.id}
          schedule={campaign}
          signedIn={!!user}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
