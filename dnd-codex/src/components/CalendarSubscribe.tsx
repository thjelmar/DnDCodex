import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { ensureCalendarToken, getCalendarToken } from '../auth/cloud'

// Calendar subscription, not a file download. Players subscribe once to a
// webcal:// feed (/api/calendar) and their calendar app auto-refreshes when the
// DM changes the date. The DM (manage) copies a link to share; a player opens
// the webcal:// link to subscribe. Both resolve to the same per-campaign feed.

function feedUrl(campaignId: string, token: string, scheme: 'https' | 'webcal'): string {
  // Built against the live origin, so the webcal link works on the deployed site.
  return `${scheme}://${window.location.host}/api/calendar?c=${campaignId}&t=${token}`
}

export function CalendarSubscribe({ campaignId, manage }: { campaignId: string; manage: boolean }) {
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Players load the token to render their subscribe link; the DM mints it on
  // demand when they copy, so no read is needed up front.
  useEffect(() => {
    if (manage) return
    let on = true
    getCalendarToken(campaignId).then((t) => on && setToken(t))
    return () => {
      on = false
    }
  }, [campaignId, manage])

  if (manage) {
    const onCopy = async () => {
      const t = await ensureCalendarToken(campaignId)
      if (!t) return
      try {
        await navigator.clipboard.writeText(feedUrl(campaignId, t, 'https'))
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      } catch {
        // Clipboard can be blocked; nothing to do but let the user try again.
      }
    }
    return (
      <button className="btn ghost small" onClick={onCopy} title="Copy a calendar subscription link to share with players">
        <Icon name="calendar" size={13} /> {copied ? 'Link copied' : 'Copy calendar link'}
      </button>
    )
  }

  if (!token) return null
  return (
    <a className="btn ghost small" href={feedUrl(campaignId, token, 'webcal')} title="Subscribe in your calendar app">
      <Icon name="calendar" size={13} /> Add to my calendar
    </a>
  )
}
