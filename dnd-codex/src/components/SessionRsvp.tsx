import { useEffect, useState } from 'react'
import { useSessionRsvps } from '../lib/useSessionRsvps'
import {
  setMyRsvp,
  clearMyRsvp,
  getCampaignMembers,
  type RsvpStatus,
  type SessionRsvp,
  type Member,
} from '../auth/cloud'

// Player RSVP control + DM tally for the next scheduled session (T-9). Both read
// the same live `session_rsvps` list via useSessionRsvps. Answers are matched to
// the session date they were given for, so when the DM reschedules the old
// answers fall away and everyone is asked again for the new date.

const OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: 'yes', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: "Can't" },
]

/** The RSVPs that answer the current session date (ignoring stale ones). */
function forDate(rsvps: SessionRsvp[], sessionDate: string | null) {
  const cur = rsvps.filter((r) => (r.sessionDate ?? null) === (sessionDate ?? null))
  return {
    yes: cur.filter((r) => r.status === 'yes'),
    maybe: cur.filter((r) => r.status === 'maybe'),
    no: cur.filter((r) => r.status === 'no'),
  }
}

/**
 * Player-facing RSVP: a Going / Maybe / Can't toggle for the scheduled session,
 * with a small "N going" count of the party. Clicking the current choice again
 * clears it (back to no reply).
 */
export function RsvpControl({
  cloudCampaignId,
  userId,
  sessionDate,
}: {
  cloudCampaignId: string
  userId: string
  sessionDate: string | null
}) {
  const rsvps = useSessionRsvps(cloudCampaignId)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const mine = rsvps.find(
    (r) => r.userId === userId && (r.sessionDate ?? null) === (sessionDate ?? null),
  )
  const current = mine?.status ?? null
  const counts = forDate(rsvps, sessionDate)
  const total = counts.yes.length + counts.maybe.length + counts.no.length

  async function choose(status: RsvpStatus) {
    setErr(null)
    setBusy(true)
    try {
      if (current === status) await clearMyRsvp(cloudCampaignId, userId)
      else await setMyRsvp(cloudCampaignId, userId, status, sessionDate)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save your RSVP.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rsvp-control">
      <span className="rsvp-prompt">Will you make it?</span>
      <div className="rsvp-seg" role="group" aria-label="RSVP to the next session">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            className={`rsvp-opt rsvp-${o.value}${current === o.value ? ' active' : ''}`}
            onClick={() => choose(o.value)}
            disabled={busy}
            aria-pressed={current === o.value}
          >
            {o.label}
          </button>
        ))}
      </div>
      {total > 0 && (
        <span className="rsvp-mini">
          {counts.yes.length} going
          {counts.maybe.length > 0 && ` · ${counts.maybe.length} maybe`}
        </span>
      )}
      {err && <span className="rsvp-err">{err}</span>}
    </div>
  )
}

/**
 * DM-facing tally of who has RSVP'd for the scheduled session, including players
 * who haven't answered yet (pulled from the campaign roster).
 */
export function RsvpTally({
  cloudCampaignId,
  sessionDate,
}: {
  cloudCampaignId: string
  sessionDate: string | null
}) {
  const rsvps = useSessionRsvps(cloudCampaignId)
  const [players, setPlayers] = useState<Member[]>([])

  useEffect(() => {
    let cancelled = false
    getCampaignMembers(cloudCampaignId).then((m) => {
      if (!cancelled) setPlayers(m.filter((x) => x.role !== 'dm'))
    })
    return () => {
      cancelled = true
    }
  }, [cloudCampaignId])

  const counts = forDate(rsvps, sessionDate)
  const respondedIds = new Set(
    [...counts.yes, ...counts.maybe, ...counts.no].map((r) => r.userId),
  )
  const noReply = players.filter((p) => !respondedIds.has(p.userId))

  // Nothing to show until there are players to hear from.
  if (players.length === 0 && respondedIds.size === 0) {
    return (
      <div className="rsvp-tally">
        <span className="rsvp-tally-empty">No players have joined yet.</span>
      </div>
    )
  }

  const groups: { key: string; label: string; names: string[] }[] = [
    { key: 'yes', label: 'going', names: counts.yes.map((r) => r.displayName) },
    { key: 'maybe', label: 'maybe', names: counts.maybe.map((r) => r.displayName) },
    { key: 'no', label: "can't", names: counts.no.map((r) => r.displayName) },
    { key: 'none', label: 'no reply', names: noReply.map((p) => p.displayName) },
  ]

  return (
    <div className="rsvp-tally">
      <div className="rsvp-tally-counts">
        {groups.map((g) => (
          <span key={g.key} className={`rsvp-count rsvp-${g.key}`}>
            <i className="rsvp-dot" aria-hidden /> {g.names.length} {g.label}
          </span>
        ))}
      </div>
      {groups.some((g) => g.key !== 'none' && g.names.length > 0) && (
        <div className="rsvp-tally-names">
          {groups.flatMap((g) =>
            g.names.map((n) => (
              <span key={`${g.key}-${n}`} className={`rsvp-name rsvp-${g.key}`}>
                <i className="rsvp-dot" aria-hidden /> {n}
              </span>
            )),
          )}
        </div>
      )}
    </div>
  )
}
