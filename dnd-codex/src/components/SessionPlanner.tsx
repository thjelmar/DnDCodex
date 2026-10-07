import { useState } from 'react'
import { Modal } from './Modal'
import { MonthCalendar } from './MonthCalendar'
import { SessionStatusBadge } from './SessionStatusBadge'
import { CalendarSubscribe } from './CalendarSubscribe'
import { RsvpControl, RsvpTally } from './SessionRsvp'
import { DmBackups, PlayerBackups } from './SessionPoll'
import { updateCampaign } from '../db/repo'
import {
  setSessionSchedule,
  clearSessionSchedule,
  ensureCalendarToken,
  addCandidateDay,
  approveCandidateDay,
  removeCandidateDay,
  clearCandidateDays,
  clearAllAvailability,
} from '../auth/cloud'
import { sessionStatus, type SessionSchedule } from '../lib/sessionStatus'
import { useSessionCandidates, useSessionAvailability } from '../lib/useSessionPoll'
import { useSessionRsvps } from '../lib/useSessionRsvps'
import { localIso, monthOf } from '../lib/calendar'
import type { Campaign } from '../db/types'

// The expandable "next session" panel: a month calendar with the session date
// highlighted, the add-to-calendar button, RSVP, and the backup-days poll.
// Shared by the DM (picks the date / floats backups / locks one in) and the
// player (read-only calendar, RSVP, and per-day availability once they can't
// make the primary).

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
  /** The signed-in user id, for the player's own RSVP / availability. */
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
  const [calMode, setCalMode] = useState<'primary' | 'backups'>('primary')
  const [suggestPick, setSuggestPick] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Poll state (live): candidate days + everyone's per-day availability.
  const candidates = useSessionCandidates(cloudCampaignId)
  const availability = useSessionAvailability(cloudCampaignId)
  const rsvps = useSessionRsvps(cloudCampaignId)

  const selected = dm ? date : schedule.nextSessionDate ?? null
  const scheduledDate = schedule.nextSessionDate ?? null
  const approvedSet = new Set(candidates.filter((c) => c.status === 'approved').map((c) => c.date))
  const proposedSet = new Set(candidates.filter((c) => c.status === 'proposed').map((c) => c.date))

  // The player sees the backup poll only once they've said Maybe/Can't to the
  // primary date — that's when alternatives matter.
  const myPrimary =
    scheduledDate && userId
      ? rsvps.find((r) => r.userId === userId && (r.sessionDate ?? null) === scheduledDate)?.status ?? null
      : null
  const showPlayerBackups = !dm && !!scheduledDate && (myPrimary === 'maybe' || myPrimary === 'no')

  // Player suggesting: pick happens on the main calendar; the pending pick plus
  // the player's own still-pending suggestions show dashed there.
  const playerProposedSet = new Set([
    ...candidates.filter((c) => c.status === 'proposed' && c.suggestedBy === userId).map((c) => c.date),
    ...(suggestPick ? [suggestPick] : []),
  ])
  function pickSuggestion(iso: string) {
    if (iso < today || iso === scheduledDate || approvedSet.has(iso)) return
    setSuggestPick((prev) => (prev === iso ? null : iso))
  }

  async function save() {
    const next = date || null
    if (!next) return
    const nextTime = time || null
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
      if (signedIn) {
        await clearSessionSchedule(campaign.id)
        await clearCandidateDays(campaign.id)
        await clearAllAvailability(campaign.id)
      }
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not clear.')
    } finally {
      setBusy(false)
    }
  }

  // DM "Lock it in": make a candidate the session and close the poll out.
  async function lockIn(chosen: string) {
    const prev = campaign.nextSessionDate ?? null
    const rescheduledFrom = prev && prev === today && chosen !== prev ? prev : null
    const keepTime = chosen === prev ? campaign.nextSessionTime ?? null : null
    setBusy(true)
    setErr(null)
    try {
      await updateCampaign(campaign.id, { nextSessionDate: chosen, nextSessionTime: keepTime, rescheduledFrom })
      if (signedIn) {
        await setSessionSchedule(campaign.id, { nextSessionDate: chosen, nextSessionTime: keepTime, rescheduledFrom })
        await ensureCalendarToken(campaign.id)
        await clearCandidateDays(campaign.id)
        await clearAllAvailability(campaign.id)
      }
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not lock it in.')
    } finally {
      setBusy(false)
    }
  }

  // DM calendar click: pick the primary, or (Backups mode) toggle a candidate day.
  async function toggleBackup(iso: string) {
    if (iso === scheduledDate || iso === date) return // the primary isn't a backup
    setErr(null)
    try {
      const existing = candidates.find((c) => c.date === iso)
      if (!existing) await addCandidateDay(campaign.id, iso)
      else if (existing.status === 'proposed') await approveCandidateDay(campaign.id, iso)
      else await removeCandidateDay(campaign.id, iso)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update backups.')
    }
  }

  const onPick = dm
    ? (iso: string) => {
        if (calMode === 'primary') setDate(iso)
        else toggleBackup(iso)
      }
    : showPlayerBackups
      ? pickSuggestion
      : undefined

  // Backups become available to manage once a primary date exists.
  const showDmPoll = dm && !!scheduledDate && signedIn

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

        {showDmPoll && (
          <div className="seg-filter" role="group" aria-label="Calendar mode" style={{ alignSelf: 'flex-start' }}>
            <button className={calMode === 'primary' ? 'active' : ''} onClick={() => setCalMode('primary')}>
              Primary date
            </button>
            <button className={calMode === 'backups' ? 'active' : ''} onClick={() => setCalMode('backups')}>
              Backup days
            </button>
          </div>
        )}

        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          today={today}
          onPick={onPick}
          backups={approvedSet}
          proposed={dm ? proposedSet : showPlayerBackups ? playerProposedSet : undefined}
        />

        {dm && calMode === 'primary' && (
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
                <div className="planner-section-label">RSVPs · primary date</div>
                <RsvpTally cloudCampaignId={cloudCampaignId} sessionDate={scheduledDate} />
              </div>
            )
          : scheduledDate && cloudCampaignId && userId && (
              <div className="planner-rsvp">
                <RsvpControl cloudCampaignId={cloudCampaignId} userId={userId} sessionDate={scheduledDate} />
              </div>
            )}

        {showDmPoll && (
          <DmBackups
            campaignId={campaign.id}
            candidates={candidates}
            availability={availability}
            onLockIn={lockIn}
            busy={busy}
          />
        )}

        {showPlayerBackups && cloudCampaignId && userId && (
          <PlayerBackups
            cloudCampaignId={cloudCampaignId}
            userId={userId}
            candidates={candidates}
            availability={availability}
            suggestPick={suggestPick}
            onClearPick={() => setSuggestPick(null)}
          />
        )}

        {err && <p className="planner-err">{err}</p>}
      </div>
    </Modal>
  )
}
