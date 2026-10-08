import { useState } from 'react'
import { Icon } from './Icon'
import {
  approveCandidateDay,
  removeCandidateDay,
  clearCandidateDays,
  suggestCandidateDay,
  withdrawSuggestedDay,
  setMyAvailability,
  clearMyAvailability,
  notifyDaySuggested,
  notifySuggestionDecision,
  type SessionCandidate,
  type SessionAvailability,
  type RsvpStatus,
} from '../auth/cloud'
import { formatDate } from '../lib/format'

// Session date poll (T-19 Phase 1). The DM floats backup days and players mark
// which they can make; players can also suggest a day for the DM to approve.
// These render inside the planner, below the primary date + RSVP.

const AVAIL_OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: 'No' },
]

/** Count a day's yes/maybe/no across all members. */
function tallyForDate(availability: SessionAvailability[], date: string) {
  const forDay = availability.filter((a) => a.date === date)
  return {
    yes: forDay.filter((a) => a.status === 'yes').length,
    maybe: forDay.filter((a) => a.status === 'maybe').length,
    no: forDay.filter((a) => a.status === 'no').length,
  }
}

function AvailCounts({ availability, date }: { availability: SessionAvailability[]; date: string }) {
  const t = tallyForDate(availability, date)
  if (t.yes + t.maybe + t.no === 0) return <span className="poll-counts faint">No replies yet</span>
  return (
    <span className="poll-counts">
      <span className="poll-count rsvp-yes"><i className="rsvp-dot" /> {t.yes}</span>
      <span className="poll-count rsvp-maybe"><i className="rsvp-dot" /> {t.maybe}</span>
      <span className="poll-count rsvp-no"><i className="rsvp-dot" /> {t.no}</span>
    </span>
  )
}

/**
 * DM-facing poll manager: pending player suggestions to approve, and the list of
 * backup days with their availability + "Lock it in". Adding backups happens on
 * the calendar (Backups mode) in the planner; this handles the rest.
 */
export function DmBackups({
  campaignId,
  campaignName,
  actorId,
  candidates,
  availability,
  onLockIn,
  busy,
}: {
  campaignId: string
  campaignName: string
  /** The DM's user id (= auth.uid()), for notifying the suggesting player. */
  actorId: string | null
  candidates: SessionCandidate[]
  availability: SessionAvailability[]
  onLockIn: (date: string) => void
  busy: boolean
}) {
  const [err, setErr] = useState<string | null>(null)
  const approved = candidates.filter((c) => c.status === 'approved')
  const proposed = candidates.filter((c) => c.status === 'proposed')

  async function run(fn: () => Promise<void>) {
    setErr(null)
    try {
      await fn()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  return (
    <div className="poll">
      {proposed.length > 0 && (
        <div className="poll-block">
          <div className="poll-section-label">Player suggestions</div>
          {proposed.map((c) => (
            <div key={c.date} className="poll-row">
              <span className="poll-date">
                {formatDate(c.date)}
                {c.suggesterName && <span className="faint"> · {c.suggesterName}</span>}
              </span>
              <span className="poll-row-actions">
                <button
                  className="btn small"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await approveCandidateDay(campaignId, c.date)
                      if (actorId && c.suggestedBy)
                        await notifySuggestionDecision(campaignId, actorId, campaignName, c.suggestedBy, c.date, true)
                    })
                  }
                >
                  Add as backup
                </button>
                <button
                  className="icon-btn"
                  title="Dismiss"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await removeCandidateDay(campaignId, c.date)
                      if (actorId && c.suggestedBy)
                        await notifySuggestionDecision(campaignId, actorId, campaignName, c.suggestedBy, c.date, false)
                    })
                  }
                >
                  <Icon name="trash" size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="poll-block">
        <div className="row between" style={{ alignItems: 'center' }}>
          <div className="poll-section-label" style={{ margin: 0 }}>Backup days</div>
          {approved.length > 0 && (
            <button className="btn ghost small" disabled={busy} onClick={() => run(() => clearCandidateDays(campaignId))}>
              Clear backups
            </button>
          )}
        </div>
        {approved.length === 0 ? (
          <p className="faint" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Tap days on the calendar (Backups mode) to float alternatives when the date doesn’t work for everyone.
          </p>
        ) : (
          approved.map((c) => (
            <div key={c.date} className="poll-row">
              <span className="poll-date">{formatDate(c.date)}</span>
              <AvailCounts availability={availability} date={c.date} />
              <span className="poll-row-actions">
                <button className="btn small" disabled={busy} onClick={() => onLockIn(c.date)}>
                  Lock it in
                </button>
                <button className="icon-btn" title="Remove" disabled={busy} onClick={() => run(() => removeCandidateDay(campaignId, c.date))}>
                  <Icon name="trash" size={13} />
                </button>
              </span>
            </div>
          ))
        )}
      </div>
      {err && <p className="planner-err">{err}</p>}
    </div>
  )
}

/**
 * Player-facing poll: a yes/maybe/no toggle for each backup day the DM floated,
 * plus a "suggest a day" action driven by the main calendar (the parent lifts
 * the pending pick). Shown only once the player has said Maybe/Can't to the
 * primary date (the parent gates on that).
 */
export function PlayerBackups({
  cloudCampaignId,
  userId,
  campaignName,
  candidates,
  availability,
  suggestPick,
  onClearPick,
}: {
  cloudCampaignId: string
  userId: string
  campaignName: string
  candidates: SessionCandidate[]
  availability: SessionAvailability[]
  /** The day the player tapped on the main calendar to suggest, or null. */
  suggestPick: string | null
  onClearPick: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const approved = candidates.filter((c) => c.status === 'approved')
  const mySuggestions = candidates.filter((c) => c.status === 'proposed' && c.suggestedBy === userId)
  const mineByDate = new Map(availability.filter((a) => a.userId === userId).map((a) => [a.date, a.status]))

  async function run(fn: () => Promise<void>) {
    setErr(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function choose(date: string, status: RsvpStatus) {
    const current = mineByDate.get(date)
    await run(() =>
      current === status
        ? clearMyAvailability(cloudCampaignId, userId, date)
        : setMyAvailability(cloudCampaignId, userId, date, status),
    )
  }

  async function submitSuggestion() {
    if (!suggestPick) return
    const day = suggestPick
    await run(async () => {
      await suggestCandidateDay(cloudCampaignId, userId, day)
      await notifyDaySuggested(cloudCampaignId, userId, campaignName, day)
    })
    onClearPick()
  }

  return (
    <div className="poll">
      {approved.length > 0 && (
        <div className="poll-block">
          <div className="poll-section-label">Other days that might work</div>
          {approved.map((c) => {
            const mine = mineByDate.get(c.date) ?? null
            return (
              <div key={c.date} className="poll-row">
                <span className="poll-date">{formatDate(c.date)}</span>
                <div className="rsvp-seg" role="group" aria-label={`Availability for ${formatDate(c.date)}`}>
                  {AVAIL_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      className={`rsvp-opt rsvp-${o.value}${mine === o.value ? ' active' : ''}`}
                      disabled={busy}
                      aria-pressed={mine === o.value}
                      onClick={() => choose(c.date, o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="poll-block">
        <div className="poll-section-label">Suggest a day you can make</div>
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {suggestPick ? (
            <>
              <button className="btn small" disabled={busy} onClick={submitSuggestion}>
                Suggest {formatDate(suggestPick)}
              </button>
              <button className="btn ghost small" disabled={busy} onClick={onClearPick}>
                Clear
              </button>
            </>
          ) : (
            <span className="faint" style={{ fontSize: 12 }}>
              Tap a day on the calendar above to suggest it.
            </span>
          )}
        </div>
        {mySuggestions.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {mySuggestions.map((c) => (
              <div key={c.date} className="poll-row">
                <span className="poll-date">
                  {formatDate(c.date)} <span className="faint">· waiting on the DM</span>
                </span>
                <button
                  className="btn ghost small"
                  disabled={busy}
                  onClick={() => run(() => withdrawSuggestedDay(cloudCampaignId, userId, c.date))}
                >
                  Withdraw
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {err && <p className="planner-err">{err}</p>}
    </div>
  )
}
