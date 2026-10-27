import type { MouseEvent } from 'react'
import { Icon } from './Icon'
import { isDemo } from '../lib/demo'
import { discordVoiceLinks, type DiscordChannelRef } from '../lib/discord'

// "Join voice" link to a Discord voice channel (T-42). Renders nothing when
// there's no channel or in demo mode.
//
// A plain left-click tries the Discord desktop app first (the discord:// deep
// link) and falls back to the https channel page when the app isn't installed.
// The app attempt goes through a hidden iframe so an unregistered scheme fails
// silently instead of showing Safari's "address is invalid" dialog; if the app
// opens, the tab loses focus and we skip the web fallback. The anchor's href is
// the https URL, so middle-click / "open in new tab" / right-click still work.
export function JoinVoiceButton({
  channel,
  size = 'small',
}: {
  channel: DiscordChannelRef | null
  /** Button sizing: 'small' matches toolbar buttons; '' is the default size. */
  size?: 'small' | ''
}) {
  if (!channel || isDemo()) return null
  const { app, web } = discordVoiceLinks(channel)

  function openVoice(e: MouseEvent<HTMLAnchorElement>) {
    // Let modified clicks use the plain href (new tab, download, etc.).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()

    let handled = false
    const markHandled = () => {
      handled = true
    }
    // If the app opens, the browser tab blurs / hides — that's our signal to
    // skip the web fallback.
    window.addEventListener('blur', markHandled, { once: true })
    window.addEventListener('pagehide', markHandled, { once: true })
    const onVis = () => {
      if (document.hidden) handled = true
    }
    document.addEventListener('visibilitychange', onVis)

    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = app
    document.body.appendChild(iframe)

    window.setTimeout(() => {
      window.removeEventListener('blur', markHandled)
      window.removeEventListener('pagehide', markHandled)
      document.removeEventListener('visibilitychange', onVis)
      iframe.remove()
      if (!handled && !document.hidden) {
        window.open(web, '_blank', 'noopener,noreferrer')
      }
    }, 1200)
  }

  return (
    <a
      className={`btn ghost ${size}`.trim()}
      href={web}
      target="_blank"
      rel="noreferrer noopener"
      onClick={openVoice}
      title="Open the voice channel in Discord (app, or browser)"
    >
      <Icon name="headphones" size={14} /> Join voice
    </a>
  )
}
