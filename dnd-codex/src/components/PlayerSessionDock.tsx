import { useEffect, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { updatePlayerNote } from '../db/repo'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { Inspector, type ExtraInspectorTab } from './battlemap/Inspector'
import type { PanelPlacement } from '../lib/usePanelPlacement'
import { SharedHandouts } from './SharedHandouts'
import { type LiveCombat, type LiveCombatRow } from '../auth/liveCombat'
import { PlayerInitiativePanel } from './PlayerInitiativePanel'
import { needsInitiative } from './PlayerTurnStrip'
import { conditionMeta } from '../lib/combat'

// The player's docked panel for the live session (T-104): Initiative, Me, Notes and
// Handouts in one tabbed column, the way Run Mode docks the DM's tools. It reads the
// same privacy-filtered combat the strip does and adds nothing the DM did not share.
// Like the strip, this file never imports the DM's reveal guard.

export type DockTab = 'initiative' | 'me' | 'notes' | 'handouts'

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

export function PlayerSessionDock({
  tab,
  onTab,
  combat,
  cloudCampaignId,
  localCampaignId,
  userId,
  notes,
  place,
}: {
  tab: DockTab
  onTab: (t: DockTab) => void
  combat: LiveCombat | null
  cloudCampaignId: string
  localCampaignId: string
  userId: string | null
  notes: ReactNode
  /** Where the panel sits (docked, floating, own window), shared with full screen. */
  place: PanelPlacement
}) {
  const asking = needsInitiative(combat, userId)
  const tabs: ExtraInspectorTab[] = [
    { id: 'initiative', label: 'Initiative', icon: 'swords', badge: asking ? { testId: 'initiative-badge', label: 'Your DM is asking for initiative' } : undefined },
    { id: 'me', label: 'Me', icon: 'heart' },
    { id: 'notes', label: 'Notes', icon: 'notes' },
    { id: 'handouts', label: 'Handouts', icon: 'image' },
  ]
  if (place.mode === 'closed') return null
  const inspector = (
    <Inspector
      mode={place.mode === 'window' ? 'window' : place.mode === 'float' ? 'float' : 'docked'}
      tab={tab}
      onTab={(t) => onTab(t as DockTab)}
      extraTabs={tabs}
      hideSceneTabs
      noun="panel"
      ariaLabel="Session panel"
      className="pl-panel"
      posKey="player-panel"
      canFloat={place.canFloat}
      canClose={place.canClose}
      onToggleFloat={place.toggleFloat}
      onOpenWindow={place.openWindow}
      onClose={place.close}
    >
      <div className="pl-dock-body" id="pl-dock-body" role="tabpanel" data-testid="player-dock">
        {tab === 'initiative' && <PlayerInitiativePanel combat={combat} cloudCampaignId={cloudCampaignId} localCampaignId={localCampaignId} userId={userId} />}
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
    </Inspector>
  )
  // In its own window the same element renders there through a portal, so the window reads and
  // writes the page's live state (the demo's in-memory session included). The page keeps a stub.
  if (place.iw.win) {
    return (
      <>
        {createPortal(inspector, place.iw.win.document.body)}
        <aside className="bm-insp bm-stub bm-stub-float" data-testid="bm-inspector-stub">
          <div className="bm-stub-title">The session panel is in its own window</div>
          <p className="faint" style={{ fontSize: 13, margin: 0 }}>
            {place.iw.onTop
              ? 'This window stays on top of other windows. Close it to dock the panel again.'
              : 'This browser cannot keep a separate window on top, so it can hide behind other windows. Chrome and Edge 116 or later can keep it on top.'}
          </p>
          <button type="button" className="bm-btn" onClick={place.toggle}>Bring it back</button>
        </aside>
      </>
    )
  }
  return inspector
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
