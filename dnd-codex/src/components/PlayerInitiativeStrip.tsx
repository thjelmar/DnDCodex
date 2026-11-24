import type { LiveCombat } from '../auth/liveCombat'

// The "Roll for initiative" prompt (T-100, reworked in T-108). Joining now happens in the
// Initiative tab, at the bottom of the list, so this is only a nudge: it shows while the DM is
// gathering initiative and you are not in the order yet. Its button asks the session page to show
// the Initiative tab, and the full screen map to open its drawer. This file never imports the
// DM's reveal guard.

/** Fired by the prompt; the session page and the full screen board listen for it. */
export const OPEN_INITIATIVE_EVENT = 'dnd-open-initiative'

export function PlayerInitiativeStrip({ combat, userId }: { combat: LiveCombat | null; userId: string | null }) {
  if (!combat || combat.phase !== 'gathering' || !userId) return null
  if (combat.rows.some((r) => r.controlledBy === userId)) return null
  return (
    <div className="pl-ask" data-testid="initiative-strip" role="status" aria-live="polite">
      <span className="pl-pulse" aria-hidden />
      <span className="pl-ask-text">
        <strong data-testid="strip-round">Roll for initiative</strong>
        <span className="faint"> · your DM is asking</span>
      </span>
      <button type="button" className="btn small primary" data-testid="open-initiative" onClick={() => window.dispatchEvent(new Event(OPEN_INITIATIVE_EVENT))}>
        Open Initiative
      </button>
    </div>
  )
}

/** True while the DM is asking and this player is not in the order: drives the badge on the tab. */
export function needsInitiative(combat: LiveCombat | null, userId: string | null): boolean {
  return !!combat && combat.phase === 'gathering' && !!userId && !combat.rows.some((r) => r.controlledBy === userId)
}
