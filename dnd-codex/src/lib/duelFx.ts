// Which on-screen effect a Daily Duel attack plays. Pure and derived from the
// attack's name, so the 40 foes and 20 heroes need no per-attack art data.
import type { DuelAttack } from '../data/duelists'

export type DuelFxKind =
  | 'slash' | 'smash' | 'burst' | 'arc' | 'spear' // attacks
  | 'dodge' | 'heal' | 'surge' | 'buff' | 'ward' //  non-attack moves

// Substring matches, so "Longbow" and "Firebolt" count as ranged.
const RANGED = /bow|arrow|volley|javelin|dart|spear|throw|barrage|blast|ray|bolt|fire|flame|beam|spit|breath|web|sling|spark|lightning|storm/
const BURST = /\b(bash|headbutt|pommel|jab|flick|bite|fang|sting|strikes?|spirit)\b/
const SMASH = /club|hammer|mace|maul|smash|slam|crush|stomp|overhead|morningstar|fist|pound/
const ARC = /\b(haymaker|wild|sweep|swings?|fury|frenzy|flurry|rend\w*|hug|ambush|drain)\b/

/** The effect for one attack. An explicit `fx` on the attack wins. */
export function attackFx(a: Pick<DuelAttack, 'id' | 'name'> & { fx?: DuelAttack['fx'] }): 'slash' | 'smash' | 'burst' | 'arc' | 'spear' {
  if (a.fx) return a.fx
  if (a.id === 'power') return 'smash'
  const n = a.name.toLowerCase().replace(/[’']/g, '')
  if (RANGED.test(n)) return 'spear'
  if (SMASH.test(n)) return 'smash'
  if (ARC.test(n)) return 'arc'
  if (BURST.test(n)) return 'burst'
  return 'slash'
}
