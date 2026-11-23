import type { SceneToken, TokenKind } from '../db/types'

/** The inspector's sections, in display order. */
export const TOKEN_KINDS: { kind: TokenKind; title: string; chip: string; one: string }[] = [
  { kind: 'character', title: 'Characters', chip: 'Characters', one: 'Character' },
  { kind: 'npc', title: 'NPCs', chip: 'NPCs', one: 'NPC' },
  { kind: 'enemy', title: 'Enemies', chip: 'Enemies', one: 'Enemy' },
  { kind: 'prop', title: 'Props', chip: 'Props', one: 'Prop' },
]

/** Maps a stored `kind` (current or from before T-103) to the current name, or undefined when unset or unknown. */
export function normalizeKind(raw: string | null | undefined): TokenKind | undefined {
  switch (raw) {
    case 'character':
    case 'hero':
      return 'character'
    case 'npc':
      return 'npc'
    case 'enemy':
    case 'foe':
      return 'enemy'
    case 'prop':
    case 'object':
      return 'prop'
    default:
      return undefined
  }
}

/**
 * The section a token belongs to. A kind the DM set (or an older scene stored) wins.
 * Otherwise the first match of: player-controlled or a PC combatant is a Character;
 * a friendly token is an NPC; an NPC-linked or combat-linked token is an Enemy;
 * anything else is a Prop.
 */
export function resolveKind(token: SceneToken, combatant?: { isPC: boolean } | null): TokenKind {
  const set = normalizeKind(token.kind)
  if (set) return set
  if (token.controlledBy || combatant?.isPC) return 'character'
  if (token.friendly) return 'npc'
  if (token.npcId || combatant) return 'enemy'
  return 'prop'
}
