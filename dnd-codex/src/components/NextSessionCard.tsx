import { useState } from 'react'
import { Icon } from './Icon'
import { SessionStatusBadge } from './SessionStatusBadge'
import { CalendarSubscribe } from './CalendarSubscribe'
import { RsvpTally } from './SessionRsvp'
import { updateCampaign } from '../db/repo'
import { useAuth } from '../auth/AuthProvider'
import { setSessionSchedule, clearSessionSchedule, ensureCalendarToken } from '../auth/cloud'
import { sessionStatus } from '../lib/sessionStatus'
import type { Campaign } from '../db/types'

// DM control for the next-session schedule. Writes the campaign's local fields
// (works offline, local-first) and mirrors to the cloud so players see it live.
// A lightweight stand-in until a full calendar add-on.

/** Local `yyyy-mm-dd` for a Date (not UTC). */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function NextSessionCard({ campaign }: { campaign: Campaign }) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(campaign.nextSessionDate ?? '')
  const [time, setTime] = useState(campaign.nextSessionTime ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const status = sessionStatus(campaign, false)

  function open() {
    setDate(campaign.nextSessionDate ?? '')
    setTime(campaign.nextSessionTime ?? '')
    setErr(null)
    setEditing(true)
  }

  async function save() {
    const next = date || null
    const nextTime = next ? time || null : null
    // Reschedule: the session was set for today and is being moved to a later day.
    const today = localIso(new Date())
    const prev = campaign.nextSessionDate ?? null
    const rescheduledFrom = prev && prev === today && next && next !== prev ? prev : null

    setBusy(true)
    setErr(null)
    try {
      await updateCampaign(campaign.id, {
        nextSessionDate: next,
        nextSessionTime: nextTime,
        rescheduledFrom,
      })
      // Mirror to players when signed in; local-first still works if this fails.
      if (user) {
        if (next) {
          await setSessionSchedule(campaign.id, { nextSessionDate: next, nextSessionTime: nextTime, rescheduledFrom })
          // Mint the subscribe token now so players get their calendar link automatically.
          await ensureCalendarToken(campaign.id)
        } else {
          await clearSessionSchedule(campaign.id)
        }
      }
      setEditing(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save. Are you signed in?')
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    setBusy(true)
    setErr(null)
    try {
      await updateCampaign(campaign.id, { nextSessionDate: null, nextSessionTime: null, rescheduledFrom: null })
      if (user) await clearSessionSchedule(campaign.id)
      setEditing(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not clear.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="next-session">
      <div className="row between" style={{ alignItems: 'center', gap: 12 }}>
        <div className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
          <span className="next-session-label">Next session</span>
          <SessionStatusBadge status={status} />
        </div>
        {!editing && (
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            {campaign.nextSessionDate && user && <CalendarSubscribe campaignId={campaign.id} manage />}
            <button className="btn ghost small" onClick={open}>
              <Icon name={campaign.nextSessionDate ? 'pencil' : 'plus'} size={13} />
              {campaign.nextSessionDate ? 'Change' : 'Set date'}
            </button>
          </div>
        )}
      </div>

      {editing && (
        <div className="next-session-edit">
          <div className="field" style={{ margin: 0 }}>
            <label>Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Time (optional)</label>
            <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} />
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <button className="btn primary small" onClick={save} disabled={busy}>
              {busy ? '…' : 'Save'}
            </button>
            {campaign.nextSessionDate && (
              <button className="btn ghost small" onClick={clear} disabled={busy}>Clear</button>
            )}
            <button className="btn ghost small" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {!editing && campaign.nextSessionDate && user && (
        <RsvpTally cloudCampaignId={campaign.id} sessionDate={campaign.nextSessionDate} />
      )}
      {err && <p className="muted" style={{ color: 'var(--bad)', margin: '8px 0 0' }}>{err}</p>}
    </div>
  )
}
