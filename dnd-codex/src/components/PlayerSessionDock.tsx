import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { updatePlayerNote } from '../db/repo'
import { Icon } from './Icon'
import { SharedHandouts } from './SharedHandouts'
import { endMyTurn, orderRows, type LiveCombat, type LiveCombatRow } from '../auth/liveCombat'
import { conditionMeta } from '../lib/combat'
import type { HealthMarker } from '../lib/liveCombat'

// The player's docked panel for the live session (T-104): Initiative, Me, Notes and
// Handouts in one tabbed column, the way Run Mode docks the DM's tools. It reads the
// same privacy-filtered combat the strip does and adds nothing the DM did not share.
// Like the strip, this file never imports the DM's reveal guard.

export type DockTab = 'initiative' | 'me' | 'notes' | 'handouts'

const MARKER_TEXT: Record<HealthMarker, string> = { injured: 'Injured', bloodied: 'Bloodied', deaths_door: 'Death’s door' }

/** The rows of this combat the signed-in player controls that are acting right now. */
export function myActiveRows(combat: LiveCombat | null, userId: string | null): LiveCombatRow[] {
  if (!combat || combat.phase !== 'active' || !userId) return []
  return combat.rows.filter((r) => r.controlledBy === userId && combat.activeIds.includes(r.id))
}

/**
 * Tell the player it is their turn: the banner, a vibration, and a title prefix
 * for background tabs. Clears itself when the turn passes. (Push notifications
 * while the app is closed are a separate ticket, T-25.)
 */
export function useMyTurnAlert(mine: LiveCombatRow[]) {
  const on = mine.length > 0
  useEffect(() => {
    if (!on) return
    const title = document.title
    document.title = `● Your turn · ${title}`
    try { navigator.vibrate?.([120, 60, 120]) } catch { /* not supported */ }
    return () => { document.title = title }
  }, [on])
}

/** "Your turn" banner with End turn, for the top bar. Shows nothing when it is not your turn. */
export function PlayerTurnBanner({
  rows,
  cloudCampaignId,
}: {
  rows: LiveCombatRow[]
  cloudCampaignId: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asked, setAsked] = useState<string | null>(null)
  const row = rows[0]
  // A new turn clears the "waiting for your DM" state.
  useEffect(() => { setAsked(null); setError(null) }, [row?.id])
  if (!row) return null
  async function end() {
    setBusy(true)
    setError(null)
    try {
      await endMyTurn(cloudCampaignId, row.id)
      setAsked(row.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not end your turn. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="pl-turn" data-testid="your-turn" role="status" aria-live="polite">
      <span className="pl-turn-dot" aria-hidden />
      <strong>Your turn{rows.length === 1 ? ` · ${row.name}` : ''}</strong>
      <button type="button" className="btn small primary" onClick={end} disabled={busy || asked === row.id} data-testid="end-turn">
        {asked === row.id ? 'Waiting for your DM…' : 'End turn'}
      </button>
      {error && <span className="pis-error" role="alert">{error}</span>}
    </div>
  )
}

export function PlayerSessionDock({
  tab,
  onTab,
  combat,
  cloudCampaignId,
  localCampaignId,
  userId,
  notes,
}: {
  tab: DockTab
  onTab: (t: DockTab) => void
  combat: LiveCombat | null
  cloudCampaignId: string
  localCampaignId: string
  userId: string | null
  notes: ReactNode
}) {
  const tabs: { id: DockTab; label: string; icon: 'swords' | 'user' | 'pencil' | 'image' }[] = [
    { id: 'initiative', label: 'Initiative', icon: 'swords' },
    { id: 'me', label: 'Me', icon: 'user' },
    { id: 'notes', label: 'Notes', icon: 'pencil' },
    { id: 'handouts', label: 'Handouts', icon: 'image' },
  ]
  return (
    <aside className="pl-dock card" data-testid="player-dock" aria-label="Session panel">
      <div className="pl-dock-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`pl-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="pl-dock-body"
            className={`pl-dock-tab${tab === t.id ? ' on' : ''}`}
            onClick={() => onTab(t.id)}
          >
            <Icon name={t.icon} size={14} /> <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="pl-dock-body" id="pl-dock-body" role="tabpanel" aria-labelledby={`pl-tab-${tab}`}>
        {tab === 'initiative' && <InitiativeList combat={combat} cloudCampaignId={cloudCampaignId} userId={userId} />}
        {tab === 'me' && <MeTab combat={combat} localCampaignId={localCampaignId} userId={userId} />}
        {tab === 'notes' && notes}
        {tab === 'handouts' && (
          <>
            <div className="run-col-heading"><Icon name="image" size={15} /> Shared by your DM</div>
            <SharedHandouts linkedCampaignId={cloudCampaignId} />
            <p className="faint" style={{ fontSize: 12 }}>Handouts your DM shows appear here as soon as they do.</p>
          </>
        )}
      </div>
    </aside>
  )
}

function InitiativeList({ combat, cloudCampaignId, userId }: { combat: LiveCombat | null; cloudCampaignId: string; userId: string | null }) {
  const rows = useMemo(() => (combat ? orderRows(combat.rows) : []), [combat])
  if (!combat) {
    return (
      <div className="pl-empty" data-testid="initiative-empty">
        <b>No combat yet</b>
        <p className="faint">Your DM will ask for initiative when a fight starts. Your turn order appears here.</p>
      </div>
    )
  }
  return (
    <div data-testid="initiative-list">
      <div className="run-col-heading">
        {combat.phase === 'active' ? `Round ${combat.round}` : 'Roll for initiative'}
        <span className="faint" style={{ marginLeft: 8, fontWeight: 400 }}>{rows.length} in the order</span>
      </div>
      {combat.phase === 'gathering' && (
        <p className="faint" style={{ fontSize: 13 }}>Use <b>Join initiative</b> above the map to add your character. Enemies appear when your DM starts combat.</p>
      )}
      {rows.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Nobody has joined yet.</p>}
      <ol className="pl-init-list">
        {rows.map((r) => (
          <InitRow
            key={r.id}
            r={r}
            now={combat.activeIds.includes(r.id)}
            mine={!!userId && r.controlledBy === userId}
            cloudCampaignId={cloudCampaignId}
          />
        ))}
      </ol>
    </div>
  )
}

function InitRow({ r, now, mine, cloudCampaignId }: { r: LiveCombatRow; now: boolean; mine: boolean; cloudCampaignId: string }) {
  const ally = r.kind !== 'enemy'
  return (
    <li className={`pl-init-row${now ? ' now' : ''}${mine ? ' me' : ''}`} data-testid="dock-row" data-kind={r.kind}>
      <span className="pl-init-num">{r.initiative ?? '–'}</span>
      <span className="pl-init-main">
        <span className="pl-init-name">
          {r.name}{r.groupCount != null && r.groupCount > 1 ? ` ×${r.groupCount}` : ''}
          {mine && <em className="pl-you">You</em>}
        </span>
        <span className="pl-init-sub faint">
          {now ? 'Acting now' : ally ? (r.kind === 'pc' ? 'Player' : 'Ally') : 'Enemy'}
          {r.conditions.slice(0, 3).map((c) => (
            <small key={c} style={{ color: conditionMeta(c).color, marginLeft: 6 }}>{conditionMeta(c).code}</small>
          ))}
        </span>
      </span>
      {ally && r.hp != null && r.maxHp != null && <span className="pl-init-hp" data-testid="dock-hp">{r.hp}/{r.maxHp} HP</span>}
      {r.healthMarker && <span className="pl-init-marker" data-testid="dock-marker">{MARKER_TEXT[r.healthMarker]}</span>}
      {mine && now && <EndTurnButton rowId={r.id} cloudCampaignId={cloudCampaignId} />}
    </li>
  )
}

function EndTurnButton({ rowId, cloudCampaignId }: { rowId: string; cloudCampaignId: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'asked'>('idle')
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className="btn small primary"
        disabled={state !== 'idle'}
        onClick={async () => {
          setState('busy')
          setError(null)
          try {
            await endMyTurn(cloudCampaignId, rowId)
            setState('asked')
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not end your turn.')
            setState('idle')
          }
        }}
      >
        {state === 'asked' ? 'Waiting…' : 'End turn'}
      </button>
      {error && <span className="pis-error" role="alert">{error}</span>}
    </>
  )
}

/** The player's own character(s): HP they can adjust (local sheet), AC, speed, and the conditions the DM set. */
function MeTab({ combat, localCampaignId, userId }: { combat: LiveCombat | null; localCampaignId: string; userId: string | null }) {
  const notes = useLiveQuery(
    () => db.playerNotes.where('campaignId').equals(localCampaignId).filter((n) => n.section === 'character').toArray(),
    [localCampaignId],
  )
  const mineRows = combat && userId ? combat.rows.filter((r) => r.controlledBy === userId) : []
  if (!notes) return null
  if (notes.length === 0) {
    return (
      <div className="pl-empty" data-testid="me-empty">
        <b>No character yet</b>
        <p className="faint">Add a character on your player page and it shows here, with your HP and conditions.</p>
      </div>
    )
  }
  return (
    <div className="pl-me" data-testid="me-tab">
      {notes.map((n) => {
        const sheet = n.characterData
        const max = sheet?.maxHp ?? null
        const cur = sheet?.currentHp ?? max
        const row = mineRows.find((r) => r.name.trim().toLowerCase() === (n.title || '').trim().toLowerCase())
        const speed = sheet?.speeds?.walk
        const adjust = (d: number) => {
          if (!sheet || cur == null) return
          const next = Math.max(0, Math.min(max ?? 999, cur + d))
          void updatePlayerNote(n.id, { characterData: { ...sheet, currentHp: next } })
        }
        return (
          <div key={n.id} className="pl-me-card">
            <div className="pl-me-head"><b>{n.title || 'My character'}</b>{row && <span className="faint"> · in initiative ({row.initiative ?? '–'})</span>}</div>
            <div className="pl-me-stats">
              <div className="pl-me-stat">
                <small>Hit points</small>
                <span data-testid="me-hp">{cur ?? '–'}{max != null ? `/${max}` : ''}</span>
                {sheet && cur != null && (
                  <span className="pl-me-adj">
                    <button type="button" className="btn small" aria-label="Lose 1 HP" onClick={() => adjust(-1)}>−</button>
                    <button type="button" className="btn small" aria-label="Gain 1 HP" onClick={() => adjust(1)}>+</button>
                  </span>
                )}
              </div>
              <div className="pl-me-stat"><small>Armor class</small><span>{sheet?.ac ?? '–'}</span></div>
              <div className="pl-me-stat"><small>Speed</small><span>{speed != null ? `${speed} ft` : '–'}</span></div>
            </div>
            <div className="pl-me-conds">
              <small className="faint">Conditions</small>
              {row && row.conditions.length > 0 ? (
                row.conditions.map((c) => (
                  <span key={c} className="pl-cond" style={{ borderColor: conditionMeta(c).color, color: conditionMeta(c).color }}>{c}</span>
                ))
              ) : (
                <span className="faint" style={{ fontSize: 13 }}>None</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
