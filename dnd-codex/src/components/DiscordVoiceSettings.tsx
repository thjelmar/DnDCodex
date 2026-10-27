import { useState } from 'react'
import { Icon } from './Icon'
import { updateCampaign } from '../db/repo'
import { parseDiscordChannelLink, campaignVoiceRef } from '../lib/discord'
import { JoinVoiceButton } from './JoinVoiceButton'
import type { Campaign } from '../db/types'

// DM-only control for linking the campaign's Discord voice channel (T-42). The
// DM pastes the channel link (Discord → right-click the voice channel → Copy
// Link); we store the guild + channel IDs on the campaign. Once linked, the
// "Join voice" button shows up here and in Run mode.
export function DiscordVoiceSettings({ campaign }: { campaign: Campaign }) {
  const ref = campaignVoiceRef(campaign)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  async function save() {
    const parsed = parseDiscordChannelLink(value)
    if (!parsed) {
      setError('Paste a voice-channel link, like https://discord.com/channels/<server>/<channel>.')
      return
    }
    await updateCampaign(campaign.id, {
      discordGuildId: parsed.guildId,
      discordVoiceChannelId: parsed.channelId,
    })
    setEditing(false)
    setValue('')
    setError('')
  }

  async function remove() {
    await updateCampaign(campaign.id, { discordGuildId: null, discordVoiceChannelId: null })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="field" style={{ maxWidth: 560 }}>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            autoFocus
            value={value}
            placeholder="https://discord.com/channels/…"
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') {
                setEditing(false)
                setError('')
              }
            }}
          />
          <button className="btn primary" onClick={save}>Save</button>
          <button
            className="btn ghost"
            onClick={() => {
              setEditing(false)
              setError('')
            }}
          >
            Cancel
          </button>
        </div>
        <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>
          In Discord, right-click the voice channel and choose <strong>Copy Link</strong>, then paste it here.
        </p>
        {error && <div className="danger-text" style={{ fontSize: 13 }}>{error}</div>}
      </div>
    )
  }

  return (
    <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
      {ref ? (
        <>
          <span className="link-chip" title={`Server ${ref.guildId} · Channel ${ref.channelId}`}>
            <span className="link-chip-open">
              <Icon name="headphones" size={13} /> Voice channel linked
            </span>
            <button className="link-chip-btn" title="Change channel" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={13} />
            </button>
            <button className="link-chip-btn" title="Unlink channel" onClick={remove}>
              <Icon name="x" size={12} />
            </button>
          </span>
          <JoinVoiceButton campaign={campaign} />
        </>
      ) : (
        <button className="btn ghost small" onClick={() => setEditing(true)}>
          <Icon name="plus" size={13} /> Link a voice channel
        </button>
      )}
    </div>
  )
}
