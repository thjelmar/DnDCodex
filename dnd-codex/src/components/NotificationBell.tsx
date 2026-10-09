import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
// jumps to that campaign's session view, opening the planner (every notification
// here is session-related, so landing on the RSVP/planner pop-up is the point).
// The panel is portaled to <body> with fixed positioning so the sidebar's scroll
// overflow can't clip it.

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
    offset?: string
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
    case 'session_reminder':
      return {
        title:
          p.offset === 'start'
            ? `Session starting now${at}`
            : p.offset === 'hour'
              ? `Session in 1 hour${at}`
              : `Session tomorrow${at}`,
        sub,
      }
    default:
      return { title: 'Update', sub }
  }
}

/** The in-app route for a notification's campaign, with the planner auto-opened
 *  (every notification here is session-related). Null if the local campaign
 *  isn't present — a DM owns it by id; a player mirrors it via linkedCampaignId. */
function routeFor(campaigns: Campaign[], n: AppNotification): string | null {
  const dmLocal = campaigns.find((c) => c.id === n.campaignId && c.role !== 'player')
  if (dmLocal) return `/campaign/${dmLocal.id}?planner=1`
  const playerLocal = campaigns.find((c) => c.linkedCampaignId === n.campaignId && c.role === 'player')
  if (playerLocal) return `/player/${playerLocal.id}?planner=1`
  return null
}

export function NotificationBell() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const items = useNotifications(userId)
  const campaigns = useLiveQuery(() => db.campaigns.toArray(), []) ?? []
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const unread = items.filter((n) => !n.readAt).length

  // Anchor the fixed panel just under the bell, re-measuring on open / resize.
  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 6, left: r.left })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  // Close on outside click (bell + portaled panel both count as inside) or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
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

  const panel = (
    <div
      className="notif-panel"
      role="dialog"
      aria-label="Notifications"
      ref={panelRef}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
    >
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
  )

  return (
    <div className="notif-wrap">
      <button
        ref={btnRef}
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

      {open && createPortal(panel, document.body)}
    </div>
  )
}
