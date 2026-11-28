import type { NPC, SceneToken } from '../db/types'
import { isTokenIcon, npcTokenIcon } from './tokenIcons'

// T-131: a token linked to an NPC wears that NPC's uploaded image.
//
// The art a token shows, first match wins:
//   1. The token's own image (an upload on the token, or the copy older tokens took
//      from the NPC when they were placed).
//   2. An icon or emoji someone picked on purpose (on the token, or on the NPC sheet).
//   3. The NPC's image, read live, so a portrait uploaded later shows without placing
//      the token again.
//   4. The automatic icon (keyword pick), then the initials.
// The token's own `imageId` is never rewritten: the board gets a copy with the NPC's
// image filled in, and the live scene payload gets the same copy.

type NpcArtFields = Pick<NPC, 'name' | 'role' | 'race' | 'imageId' | 'tokenIcon' | 'statBlockData' | 'sharedWithPlayers' | 'sharedSections'>

/** Whether the DM shares this NPC's Portrait section with players. The image on a
 *  token a player can see follows the same rule, so an NPC the party has not met
 *  never shows its art through a token. */
export function npcPortraitShared(npc: Pick<NPC, 'sharedWithPlayers' | 'sharedSections'>): boolean {
  if (!npc.sharedWithPlayers) return false
  return !npc.sharedSections || npc.sharedSections.includes('portrait')
}

/** True when a person picked an icon or emoji for this token or its NPC. A token's
 *  `tokenIcon` that equals the NPC's automatic pick is the value stamped at placement
 *  time, not a choice. */
function hasExplicitIcon(t: SceneToken, npc: NpcArtFields): boolean {
  if (isTokenIcon(npc.tokenIcon)) return true
  if (t.icon) return true
  return isTokenIcon(t.tokenIcon) && t.tokenIcon !== npcTokenIcon(npc)
}

/** The image to draw on a token: its own, else (when no icon was picked on purpose)
 *  its NPC's. `forPlayers` also requires the NPC's portrait to be shared. */
export function tokenImageId(t: SceneToken, npc: NpcArtFields | undefined, forPlayers = false): string | null {
  if (t.imageId) return t.imageId
  if (!npc?.imageId) return null
  if (hasExplicitIcon(t, npc)) return null
  if (forPlayers && !npcPortraitShared(npc)) return null
  return npc.imageId
}

/** A copy of `t` with the NPC's image filled in when it applies; `t` itself otherwise. */
export function withNpcImage(t: SceneToken, npc: NpcArtFields | undefined, forPlayers = false): SceneToken {
  if (t.imageId) return t
  const imageId = tokenImageId(t, npc, forPlayers)
  return imageId ? { ...t, imageId } : t
}
