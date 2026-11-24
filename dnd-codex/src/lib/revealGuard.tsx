import { useCallback } from 'react'
import { useConfirm } from '../components/ConfirmDialog'
import { COMBAT_REVEAL_KEY } from './prefs'
import { revealsNpc } from './liveCombat'
import { getRevealContext, revealWarningApplies } from './revealContext'
import type { Combatant } from './combat'

// The DM's warning before NPCs become visible to players (T-100). It is for the DM
// ONLY: the context below is set by `LiveCombatKeeper`, which mounts only inside a
// DM campaign (`role: 'dm'`). Player pages never set it, so `useConfirmReveal`
// there resolves true without a dialog. No player code imports this module (an
// ESLint rule enforces that).

/**
 * Returns `confirmReveal(rows)`: resolves true when it is safe to add `rows`
 * (nothing to warn about, or the DM confirmed), false when the DM cancelled.
 * Pass the combatants being added. `visible` says whether players can see the
 * combat right now: pass false to skip (gathering, or combat not shared).
 */
export function useConfirmReveal(): (rows: Combatant[], visible?: boolean) => Promise<boolean> {
  const confirm = useConfirm()
  return useCallback(
    async (rows, visible = true) => {
      if (!visible || !revealWarningApplies()) return true
      const shown = rows.filter((c) => revealsNpc([c], getRevealContext()!.facts))
      if (shown.length === 0) return true
      return confirm({
        title: 'Show these combatants to players?',
        message: (
          <>
            <p style={{ margin: '0 0 8px' }}>Everyone in the live session will see these combatants once they appear:</p>
            <ul style={{ margin: 0, paddingLeft: 20 }} data-testid="reveal-names">
              {shown.map((c) => (
                <li key={c.id}>{c.name}</li>
              ))}
            </ul>
          </>
        ),
        confirmLabel: 'Add',
        remember: COMBAT_REVEAL_KEY,
        rememberLabel: "Don't show this message again",
      })
    },
    [confirm],
  )
}

