import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { RunSessionNotes } from './RunPage'
import { formatDate } from '../lib/format'
import type { Id } from '../db/types'

/**
 * Session notes beside a full-screen battle map: a session picker (newest
 * first) and the same autosaving DM notes + session notes editors as Run mode.
 * Clicking a [[wiki link]] calls `onWikiLink` (the map's peek panel).
 */
export function SessionNotesPanel({
  campaignId,
  initialSessionId,
  onWikiLink,
}: {
  campaignId: Id
  initialSessionId?: Id | null
  onWikiLink: (target: string) => void
}) {
  const sessions = useLiveQuery(
    () => db.sessions.where('campaignId').equals(campaignId).reverse().sortBy('date'),
    [campaignId],
  )
  const [picked, setPicked] = useState<Id | null>(initialSessionId ?? null)
  const session = sessions?.find((s) => s.id === picked) ?? sessions?.[0] ?? null

  return (
    <aside className="battlemap-notes">
      {sessions && sessions.length > 1 && (
        <select
          className="select"
          value={session?.id ?? ''}
          onChange={(e) => setPicked(e.target.value)}
          aria-label="Session"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.title} — {formatDate(s.date)}</option>
          ))}
        </select>
      )}
      {session ? (
        <RunSessionNotes key={session.id} session={session} onWikiLink={onWikiLink} />
      ) : sessions ? (
        <p className="faint">No sessions yet. Create one from the Sessions tab or Run mode to take notes here.</p>
      ) : null}
    </aside>
  )
}
