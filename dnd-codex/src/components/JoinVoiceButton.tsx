import { Icon } from './Icon'
import { isDemo } from '../lib/demo'
import { campaignVoiceRef, discordVoiceLinks } from '../lib/discord'
import type { Campaign } from '../db/types'

// "Join voice" deep link to the campaign's Discord voice channel (T-42).
// Renders nothing when no channel is configured or in demo mode. The primary
// button opens the Discord desktop app; a small "web" link is the fallback for
// anyone without the app installed.
export function JoinVoiceButton({
  campaign,
  size = 'small',
}: {
  campaign: Campaign
  /** Button sizing: 'small' matches toolbar buttons; '' is the default size. */
  size?: 'small' | ''
}) {
  const ref = campaignVoiceRef(campaign)
  if (!ref || isDemo()) return null
  const { app, web } = discordVoiceLinks(ref)

  return (
    <span className="row" style={{ gap: 6, alignItems: 'center' }}>
      <a className={`btn ghost ${size}`.trim()} href={app} title="Open the voice channel in the Discord app">
        <Icon name="headphones" size={14} /> Join voice
      </a>
      <a
        className="faint"
        style={{ fontSize: 12 }}
        href={web}
        target="_blank"
        rel="noreferrer noopener"
        title="Open the voice channel in your browser instead"
      >
        web
      </a>
    </span>
  )
}
