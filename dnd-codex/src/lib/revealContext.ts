import { useSyncExternalStore } from 'react'
import type { TokenFacts } from './liveCombat'

// The DM-only context for the NPC warning (T-100) and the campaign's players. Set by
// `LiveCombatKeeper`, which mounts only inside a DM campaign. Player pages never set
// it, so the warning never applies there. Pure module: no JSX, so tests can import it.

export interface RevealContext {
  campaignId: string
  /** The signed-in user owns this DM campaign. */
  isDm: boolean
  /** A live session is running (the demo counts as live so the dialog can be tried). */
  sessionLive: boolean
  /** Token facts by combatant id (hidden tokens count as hidden combatants). */
  facts: Map<string, TokenFacts>
}

let ctx: RevealContext | null = null
let previewing = false

const ctxListeners = new Set<() => void>()

export function setRevealContext(next: RevealContext | null): void {
  ctx = next
  ctxListeners.forEach((l) => l())
}

/** The DM context for this campaign, or null outside a DM campaign. Re-renders on change. */
export function useRevealContext(): RevealContext | null {
  return useSyncExternalStore(
    (l) => {
      ctxListeners.add(l)
      return () => ctxListeners.delete(l)
    },
    () => ctx,
  )
}

/** The battle map's "Preview as player" mode: no warning while previewing. */
export function setRevealPreview(on: boolean): void {
  previewing = on
}

export function getRevealContext(): RevealContext | null {
  return ctx
}

/** True when the warning applies at all (DM, live session, not previewing). */
export function revealWarningApplies(): boolean {
  return !!ctx && ctx.isDm && ctx.sessionLive && !previewing
}


// The campaign's players, for "Controlled by" and the add form's Player picker.
// Set by `LiveCombatKeeper`; empty outside a DM campaign.
export interface CombatMember {
  userId: string
  name: string
}
let members: CombatMember[] = []
const memberListeners = new Set<() => void>()

export function setCombatMembers(next: CombatMember[]): void {
  members = next
  memberListeners.forEach((l) => l())
}

export function useCombatMembers(): CombatMember[] {
  return useSyncExternalStore(
    (l) => {
      memberListeners.add(l)
      return () => memberListeners.delete(l)
    },
    () => members,
  )
}
