import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getCalendarToken } from '../auth/cloud'
import { Icon } from './Icon'

// Preferences section: the campaign calendars available to this player. Because
// the feed uses one shared token per campaign, the app can't revoke a single
// player's subscription server-side — so this lists each feed with its subscribe
// link and how to remove it in the player's own calendar app. (When a DM ends a
// campaign, its feed clears for everyone automatically.)

interface Feed {
  cloudCampaignId: string
  name: string
  token: string
}

function feedUrl(f: Feed): string {
  return `webcal://${window.location.host}/api/calendar?c=${f.cloudCampaignId}&t=${f.token}`
}

export function CalendarSubscriptionsPref() {
  const players = useLiveQuery(
    () => db.campaigns.filter((c) => c.role === 'player' && !!c.linkedCampaignId).toArray(),
    [],
  )
  const [feeds, setFeeds] = useState<Feed[] | null>(null)

  useEffect(() => {
    if (!players) return
    let on = true
    ;(async () => {
      const out: Feed[] = []
      for (const c of players) {
        const token = await getCalendarToken(c.linkedCampaignId!)
        if (token) out.push({ cloudCampaignId: c.linkedCampaignId!, name: c.name, token })
      }
      if (on) setFeeds(out)
    })()
    return () => {
      on = false
    }
  }, [players])

  return (
    <div className="prefs-section">
      <div className="prefs-section-title">Calendar subscriptions</div>
      {feeds == null ? (
        <div className="faint" style={{ fontSize: 12 }}>Loading…</div>
      ) : feeds.length === 0 ? (
        <div className="faint" style={{ fontSize: 12 }}>
          No campaign calendars yet. When a DM schedules a session, that campaign's calendar shows up
          here to subscribe to.
        </div>
      ) : (
        <>
          {feeds.map((f) => (
            <div
              key={f.cloudCampaignId}
              className="row between"
              style={{ alignItems: 'center', gap: 10, padding: '6px 0' }}
            >
              <span>{f.name} — sessions</span>
              <a className="btn ghost small" href={feedUrl(f)} title="Subscribe in your calendar app">
                <Icon name="calendar" size={13} /> Subscribe
              </a>
            </div>
          ))}
          <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
            To unsubscribe, remove the “… — sessions” calendar in your calendar app. When a DM ends a
            campaign, its sessions clear from your calendar automatically.
          </div>
        </>
      )}
    </div>
  )
}
