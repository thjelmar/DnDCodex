import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { isDemo } from './demo'

// The live Discord voice roster, as broadcast by the voice bot (T-43). This is
// ephemeral Realtime broadcast data — nothing is read from or written to the
// database.

export interface VoiceMember {
  id: string
  name: string
  avatar?: string
  bot?: boolean
  muted?: boolean
  deafened?: boolean
  speaking?: boolean
}

export interface VoiceRosterData {
  channelId: string
  members: VoiceMember[]
  recording: boolean
  updatedAt?: string
}

/**
 * Subscribe to the voice roster the bot broadcasts for a Discord channel.
 * Returns the latest snapshot, or null when there's no channel configured, no
 * Supabase backend, or we're in demo mode.
 */
export function useVoiceRoster(channelId: string | null | undefined): VoiceRosterData | null {
  const [roster, setRoster] = useState<VoiceRosterData | null>(null)
  useEffect(() => {
    setRoster(null)
    const sb = supabase
    if (!channelId || !sb || isDemo()) return
    const ch = sb.channel(`voice:${channelId}`)
    ch.on('broadcast', { event: 'voice' }, (msg) => {
      const payload = msg.payload as VoiceRosterData | undefined
      if (payload && payload.channelId === channelId) setRoster(payload)
    }).subscribe()
    return () => {
      void sb.removeChannel(ch)
    }
  }, [channelId])
  return roster
}
