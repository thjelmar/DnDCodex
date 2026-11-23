import type { NPC, SceneToken, TokenKind } from '../db/types'
import { resolveKind } from './tokenKind'

/** What the selected-token card shows. Every field except the name and type can be missing. */
export interface TokenCardData {
  name: string
  kind: TokenKind
  hp: string | null
  ac: string | null
  /** Walking speed in feet and where it came from; null when unknown. */
  speedFt: number | null
  speedFrom: 'token' | 'stat block' | null
  attacks: { name: string; text: string }[]
  /** The NPC whose full stat block the card can open. */
  npcId: string | null
}

/** The walking speed in feet from stat block text: "30 ft., fly 60 ft." gives 30, "fly 60 ft." gives null. */
export function parseWalkFt(text: string | null | undefined): number | null {
  if (!text) return null
  const first = text.split(/[,;]/)[0].trim()
  // A first entry that names another mode ("fly 60 ft.") is not a walking speed.
  const m = /^(?:walk\s+)?(\d+)\s*(?:ft|feet|')/i.exec(first)
  return m ? Number(m[1]) : null
}

/** The leading integer of stat block text: "15 (studded leather)" gives "15". */
function leadingNumber(text: string | null | undefined): string | null {
  const m = /^\s*(\d+)/.exec(text ?? '')
  return m ? m[1] : null
}

/** The first sentence of an action's text, trimmed to a short line. */
function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  const end = t.search(/[.!?](\s|$)/)
  const s = end > 0 ? t.slice(0, end + 1) : t
  return s.length > 90 ? `${s.slice(0, 87)}...` : s
}

/**
 * Gathers the card's fields from what the app already stores: the token, its linked
 * combatant (HP, AC) and its linked NPC's stat block (AC, speed, actions). Nothing is
 * derived beyond reading those; absent data stays null.
 */
export function tokenCardData(
  token: SceneToken,
  combatant: { isPC: boolean; hp: number | null; maxHp: number | null; ac: number | null } | undefined,
  npc: NPC | undefined,
): TokenCardData {
  const sb = npc?.statBlockData ?? null
  const hp = combatant && combatant.hp != null ? `${combatant.hp} / ${combatant.maxHp ?? combatant.hp}` : null
  const ac = combatant?.ac != null ? String(combatant.ac) : leadingNumber(sb?.ac)
  const fromBlock = parseWalkFt(sb?.speed)
  const manual = typeof token.speedFt === 'number' && token.speedFt > 0 ? token.speedFt : null
  return {
    name: token.label,
    kind: resolveKind(token, combatant),
    hp,
    ac,
    speedFt: manual ?? fromBlock,
    speedFrom: manual != null ? 'token' : fromBlock != null ? 'stat block' : null,
    attacks: (sb?.actions ?? []).slice(0, 2).map((a) => ({ name: a.name, text: firstSentence(a.text) })),
    npcId: npc?.id ?? null,
  }
}
