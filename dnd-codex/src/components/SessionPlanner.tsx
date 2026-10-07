import { useState } from 'react'
import { Modal } from './Modal'
import { MonthCalendar } from './MonthCalendar'
import { SessionStatusBadge } from './SessionStatusBadge'
import { CalendarSubscribe } from './CalendarSubscribe'
import { RsvpControl, RsvpTally } from './SessionRsvp'
import { updateCampaign } from '../db/repo'
import { setSessionSchedule, clearSessionSchedule, ensureCalendarToken } from '../auth/cloud'
import { sessionStatus, type SessionSchedule } from '../lib/sessionStatus'
import { localIso, monthOf } from '../lib/calendar'
import type { Campaign } from '../db/types'

// The expandable "next session" panel: a month calendar with the session date
// highlighted, the add-to-calendar button, and RSVP underneath. Shared by the DM
// (who picks the date on the calendar + sees the RSVP tally) and the player (a
// read-only calendar + their own RSVP). Opened from the session box on each side.

export function SessionPlanner({
  mode,
  campaign,
  cloudCampaignId,
  userId,
  schedule,
  isLive,
  signedIn,
  onClose,
}: {
  mode: 'dm' | 'player'
  campaign: Campaign
  /** The DM's cloud campaign id: campaign.id (DM) or linkedCampaignId (player). */
  cloudCampaignId: string | null
  /** The signed-in user id, for the player's own RSVP. */
  userId?: string | null
  /** The effective schedule to show (DM: the campaign; player: the cloud hook). */
  schedule: SessionSchedule
  isLive?: boolean
  signedIn: boolean
  onClose: () => void
}) {
  const dm = mode === 'dm'
  const status = sessionStatus(schedule, !!isLive)
  const today = localIso(new Date())

  // DM-only edit state: the pending pick, committed on Save.
  const [date, setDate] = useState<string | null>(schedule.nextSessionDate ?? null)
  const [time, setTime] = useState(schedule.nextSessionTime ?? '')
  const [month, setMonth] = useState(() => monthOf(schedule.nextSessionDate))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // The DM highlights their pending pick; the player highlights the live schedule.
  const selected = dm ? date : schedule.nextSessionDate ?? null
  const scheduledDate = schedule.nextSessionDate ?? null

  async function save() {
    const next = date || null
    if (!next) return
    const nextTime = time || null
    // Reschedule: a session set for today being moved to a later day.
    const prev = campaign.nextSessionDate ?? null
    const rescheduledFrom = prev && prev === today && next !== prev ? prev : null
    setBusy(true)
    setErr(null)
    try {
      await updateCampaign(campaign.id, { nextSessionDate: next, nextSessionTime: nextTime, rescheduledFrom })
      if (signedIn) {
        await setSessionSchedule(campaign.id, { nextSessionDate: next, nextSessionTime: nextTime, rescheduledFrom })
        await ensureCalendarToken(campaign.id)
      }
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save. Are you signed in?')
    } finally {
      setBusy(false)
    }
  }

  async function clearSchedule() {
    setBusy(true)
    setErr(null)
    try {
      await updateCampaign(campaign.id, { nextSessionDate: null, nextSessionTime: null, rescheduledFrom: null })
      if (signedIn) await clearSessionSchedule(campaign.id)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not clear.')
    } finally {
      setBusy(false)
    }
  }

  const footer = dm ? (
    <>
      {campaign.nextSessionDate && (
        <button className="btn ghost small" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={clearSchedule} disabled={busy}>
          Clear schedule
        </button>
      )}
      <button className="btn ghost" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button className="btn primary" onClick={save} disabled={busy || !date}>
        {busy ? '…' : 'Save'}
      </button>
    </>
  ) : (
    <button className="btn primary" onClick={onClose}>
      Done
    </button>
  )

  return (
    <Modal title="Next session" onClose={onClose} footer={footer}>
      <div className="planner">
        <div className="planner-status">
          <SessionStatusBadge status={status} />
        </div>

        {cloudCampaignId && signedIn && (dm || scheduledDate) && (
          <div className="planner-cal-sub">
            <CalendarSubscribe campaignId={cloudCampaignId} manage={dm} />
          </div>
        )}

        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          today={today}
          onPick={dm ? (iso) => setDate(iso) : undefined}
        />

        {dm && (
          <div className="planner-time">
            <label>Time (optional)</label>
            <input
              type="time"
              className="input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!date}
            />
          </div>
        )}

        {dm
          ? scheduledDate && cloudCampaignId && signedIn && (
              <div className="planner-rsvp">
                <div className="planner-section-label">RSVPs</div>
                <RsvpTally cloudCampaignId={cloudCampaignId} sessionDate={scheduledDate} />
              </div>
            )
          : scheduledDate && cloudCampaignId && userId && (
              <div className="planner-rsvp">
                <RsvpControl cloudCampaignId={cloudCampaignId} userId={userId} sessionDate={scheduledDate} />
              </div>
            )}

        {err && <p className="planner-err">{err}</p>}
      </div>
    </Modal>
  )
}
