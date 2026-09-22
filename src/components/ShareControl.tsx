import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { pushEntity, unshareEntity } from '../auth/cloud'
import { setEntityShared } from '../db/repo'
import { revealEntity, revealHash, type ShareableKind } from '../lib/reveal'
import type { NPC, Location, Note, Session, Item } from '../db/types'

type Shareable = NPC | Location | Note | Session | Item

/**
 * Per-entity "share with players" control. Sharing/pushing uploads a reveal-safe,
 * spoiler-redacted snapshot (the DM's explicit publish step); un-sharing retracts
 * it live. "Push changes" appears only when the current reveal differs from what
 * was last pushed, so the DM controls exactly when edits reach players.
 */
export function ShareControl({
  campaignId,
  kind,
  entity,
}: {
  campaignId: string
  kind: ShareableKind
  entity: Shareable
}) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null

  const shared = entity.sharedWithPlayers === true
  const currentHash = revealHash(revealEntity(kind, entity))
  const hasPending = shared && entity.sharedPushedHash !== currentHash

  async function publish(first: boolean) {
    setBusy(true)
    setError(null)
    try {
      const snap = revealEntity(kind, entity)
      await pushEntity(campaignId, entity.id, kind, snap)
      await setEntityShared(kind, entity.id, {
        ...(first ? { sharedWithPlayers: true } : {}),
        sharedPushedHash: revealHash(snap),
      })
    } catch {
      setError(
        first
          ? 'Couldn’t share — enable sync or invite players for this campaign first.'
          : 'Couldn’t push — check your connection.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setBusy(true)
    setError(null)
    try {
      await unshareEntity(entity.id)
      await setEntityShared(kind, entity.id, { sharedWithPlayers: false })
    } catch {
      setError('Couldn’t stop sharing — check your connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="share-control">
      {!shared ? (
        <button className="btn small" disabled={busy} onClick={() => publish(true)}>
          👁 Share with players
        </button>
      ) : (
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="share-on">👁 Shared with players</span>
          {hasPending ? (
            <button
              className="btn small primary"
              disabled={busy}
              onClick={() => publish(false)}
              title="Publish your latest changes to players"
            >
              Push changes
            </button>
          ) : (
            <span className="faint" style={{ fontSize: 12 }}>up to date</span>
          )}
          <button className="btn ghost small danger" disabled={busy} onClick={stop}>
            Stop sharing
          </button>
        </div>
      )}
      {error && (
        <span style={{ color: 'var(--danger)', fontSize: 12, marginLeft: 8 }}>{error}</span>
      )}
    </div>
  )
}
