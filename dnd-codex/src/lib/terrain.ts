import type { SceneToken, TokenTerrain } from '../db/types'

// Terrain and cover markers on props (T-103). They are labels for the table:
// nothing here changes movement cost, cover bonuses or blocked paths.

/** Smallest and largest footprint of a prop, in cells. */
export const MIN_FOOTPRINT = 1
export const MAX_FOOTPRINT = 12

/** True when at least one marker is on. */
export function hasTerrain(t: TokenTerrain | null | undefined): boolean {
  return !!t && (!!t.difficult || !!t.cover || !!t.blocks)
}

/** Short tags for an inspector row or card: "Difficult", "½ cover", "¾ cover", "Blocks". */
export function terrainTags(t: TokenTerrain | null | undefined): string[] {
  if (!t) return []
  const tags: string[] = []
  if (t.difficult) tags.push('Difficult')
  if (t.cover === 'half') tags.push('½ cover')
  if (t.cover === 'three-quarters') tags.push('¾ cover')
  if (t.blocks) tags.push('Blocks')
  return tags
}

/** The cells a token covers: its `w` by `h` footprint when set, else `size` square. */
export function footprint(t: Pick<SceneToken, 'size' | 'w' | 'h'>): { w: number; h: number } {
  const clamp = (n: number) => Math.min(MAX_FOOTPRINT, Math.max(MIN_FOOTPRINT, Math.round(n)))
  return { w: clamp(t.w ?? t.size), h: clamp(t.h ?? t.size) }
}

/** True when a token should draw a footprint zone under it. */
export function drawsZone(t: SceneToken): boolean {
  return hasTerrain(t.terrain) || t.w != null || t.h != null
}

/**
 * Drops empty marker objects so a token without markers has no `terrain` key.
 * The live payload relies on this: a missing key means "send nothing".
 */
export function cleanTerrain(t: TokenTerrain): TokenTerrain | undefined {
  const out: TokenTerrain = {}
  if (t.difficult) out.difficult = true
  if (t.cover) out.cover = t.cover
  if (t.blocks) out.blocks = true
  return hasTerrain(out) ? out : undefined
}
