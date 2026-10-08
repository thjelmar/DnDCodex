import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Icon } from './Icon'
import { useAuth } from '../auth/AuthProvider'
import { useNotifications } from '../lib/useNotifications'
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  type AppNotification,
} from '../auth/cloud'
import { db } from '../db/db'
import type { Campaign } from '../db/types'
import { formatDate, relativeTime } from '../lib/format'

// The global notification bell (T-19 Phase 2). Lives in the sidebar's App icon
// row, so it's present in both the DM and player experiences. Shows an unread
// count and a dropdown of recent notifications; clicking one marks it read and
// jumps to that campaign's session view.

interface Described {
  title: string
  sub: string
}

function describe(n: AppNotification): Described {
  const p = n.payload as {
    date?: string
    time?: string
    status?: string
    actorName?: string
    campaignName?: string
  }
  const who = p.actorName || 'Someone'
  const when = p.date ? formatDate(p.date) : 'a day'
  const at = p.time ? ` at ${p.time}` : ''
  const sub = p.campaignName ?? ''
  switch (n.type) {
    case 'session_suggested':
      return { title: `${who} suggested ${when}`, sub }
    case 'session_approved':
      return { title: `${who} added ${when} as a backup`, sub }
    case 'session_declined':
      return { title: `${who} passed on ${when}`, sub }
    case 'session_scheduled':
      return { title: `Session set for ${when}${at}`, sub }
    case 'session_rescheduled':
      return { title: `Session moved to ${when}${at}`, sub }
    case 'session_rsvp':
      return { title: `${who} ${p.status === 'no' ? "can't make" : 'might make'} ${when}`, sub }
    default:
      return { title: 'Update', sub }
  }
}

/** Resolve the in-app route for a notification's campaign, or null if the local
 *  campaign isn't present (DM owns it by id; a player mirrors it via link). */
function routeFor(campaigns: Campaign[], n: AppNotification): string | null {
  const dmLocal = campaigns.find((c) => c.id === n.campaignId && c.role !== 'player')
  if (dmLocal) return `/campaign/${dmLocal.id}`
  const playerLocal = campaigns.find((c) => c.linkedCampaignId === n.campaignId && c.role === 'player')
  if (playerLocal) return `/player/${playerLocal.id}/session`
  return null
}

export function NotificationBell() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const items = useNotifications(userId)
  const campaigns = useLiveQuery(() => db.campaigns.toArray(), []) ?? []
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const unread = items.filter((n) => !n.readAt).length

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Signed-out users have no notifications; keep the row uncluttered.
  if (!userId) return null

  async function openNotif(n: AppNotification) {
    setOpen(false)
    if (!n.readAt) await markNotificationRead(n.id)
    const route = routeFor(campaigns, n)
    if (route) navigate(route)
  }

  async function dismiss(e: React.MouseEvent, n: AppNotification) {
    e.stopPropagation()
    await deleteNotification(n.id)
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        className={`icon-btn${open ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        data-tip="Notifications"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span className="notif-badge" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <span className="notif-title">Notifications</span>
            {unread > 0 && (
              <button className="btn ghost small" onClick={() => userId && markAllNotificationsRead(userId)}>
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="notif-empty">You’re all caught up.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => {
                const d = describe(n)
                return (
                  <li key={n.id}>
                    <button className={`notif-item${n.readAt ? '' : ' unread'}`} onClick={() => openNotif(n)}>
                      {!n.readAt && <span className="notif-dot" aria-hidden />}
                      <span className="notif-body">
                        <span className="notif-item-title">{d.title}</span>
                        <span className="notif-item-sub">
                          {d.sub && <span className="notif-item-campaign">{d.sub}</span>}
                          <span className="notif-item-time">{relativeTime(n.createdAt)}</span>
                        </span>
                      </span>
                      <span
                        className="notif-dismiss"
                        role="button"
                        aria-label="Dismiss"
                        title="Dismiss"
                        onClick={(e) => dismiss(e, n)}
                      >
                        <Icon name="x" size={13} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
