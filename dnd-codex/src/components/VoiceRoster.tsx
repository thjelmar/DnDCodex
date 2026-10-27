import { Icon } from './Icon'
import { isDemo } from '../lib/demo'
import { useVoiceRoster } from '../lib/useVoiceRoster'

// Live Discord voice roster (T-43): avatars of who's in the channel, a glow on
// whoever's speaking, muted/deafened badges, and a Recording indicator when the
// Craig bot is present. Renders nothing until the bot broadcasts a roster (or in
// demo mode, or with no channel configured).
export function VoiceRoster({ channelId }: { channelId?: string | null }) {
  const roster = useVoiceRoster(channelId)
  if (!roster || isDemo()) return null
  const { members, recording } = roster

  return (
    <div className="voice-roster">
      <span className="voice-roster-label">
        <Icon name="headphones" size={13} /> Voice
      </span>
      {recording && (
        <span className="voice-rec" title="The Craig bot is recording this session">
          <span className="voice-rec-dot" aria-hidden /> Recording
        </span>
      )}
      {members.length === 0 ? (
        <span className="faint" style={{ fontSize: 12 }}>No one in voice</span>
      ) : (
        <span className="voice-roster-list">
          {members.map((m) => {
            const state = m.deafened ? 'deafened' : m.muted ? 'muted' : ''
            const title = `${m.name}${state ? ` (${state})` : ''}${m.speaking ? ' — speaking' : ''}`
            return (
              <span key={m.id} className={`voice-chip${m.speaking ? ' speaking' : ''}`} title={title}>
                <span className="voice-av">
                  {m.avatar ? (
                    <img src={m.avatar} alt="" width={22} height={22} />
                  ) : (
                    <span className="voice-av-fallback">{m.name.slice(0, 1).toUpperCase()}</span>
                  )}
                  {state && <span className={`voice-av-badge ${state}`} aria-hidden />}
                </span>
                <span className="voice-chip-name">{m.name}</span>
              </span>
            )
          })}
        </span>
      )}
    </div>
  )
}
