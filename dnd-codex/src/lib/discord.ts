// Discord voice-channel linking (T-42). Pure helpers: parse a channel link the
// DM pastes, build the deep links the "Join voice" button uses, and read the
// channel reference off a campaign. No network and no bot here — Phase 1 is
// glue only. The live roster bot (T-43) is a separate, always-on process.

export interface DiscordChannelRef {
  /** The Discord server (guild) snowflake. */
  guildId: string
  /** The voice-channel snowflake within that guild. */
  channelId: string
}

// Discord snowflakes are 17–19 digits today; accept a slightly wider range to
// stay future-proof without matching short, unrelated numbers.
const SNOWFLAKE = '\\d{15,20}'
// The canonical ".../channels/<guild>/<channel>" path, as it appears in a web
// URL (discord.com, discordapp.com, ptb./canary.) or the discord:// deep link.
const CHANNELS_RE = new RegExp(`channels/(${SNOWFLAKE})/(${SNOWFLAKE})`)
// A bare "guildId/channelId" (or whitespace-separated) pair, for a DM who pastes
// just the two IDs rather than the whole link.
const BARE_RE = new RegExp(`^(${SNOWFLAKE})[\\s/]+(${SNOWFLAKE})$`)

/**
 * Parse a Discord voice-channel link into its guild and channel IDs. Accepts a
 * web URL (any discord.com / discordapp.com subdomain), the discord:// desktop
 * scheme, or a bare "guildId/channelId" pair. Returns null when the input holds
 * no channel reference.
 */
export function parseDiscordChannelLink(input: string): DiscordChannelRef | null {
  const text = (input ?? '').trim()
  if (!text) return null
  const m = CHANNELS_RE.exec(text) ?? BARE_RE.exec(text)
  if (!m) return null
  return { guildId: m[1], channelId: m[2] }
}

/**
 * The deep link (desktop app) and web URL for a voice channel. The app link
 * opens Discord directly when it's installed; the web link is the fallback that
 * works in any browser.
 */
export function discordVoiceLinks(ref: DiscordChannelRef): { app: string; web: string } {
  const path = `channels/${ref.guildId}/${ref.channelId}`
  return { app: `discord://-/${path}`, web: `https://discord.com/${path}` }
}

/** The voice-channel reference stored on a campaign, or null when unset. */
export function campaignVoiceRef(c: {
  discordGuildId?: string | null
  discordVoiceChannelId?: string | null
}): DiscordChannelRef | null {
  if (!c.discordGuildId || !c.discordVoiceChannelId) return null
  return { guildId: c.discordGuildId, channelId: c.discordVoiceChannelId }
}
