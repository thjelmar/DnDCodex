// Condition cover art (T-4). Each asset is a half-disc that covers a token's
// bottom half with the condition's name. The single top-priority active
// condition renders as its cover; every other active condition keeps its pip
// (see Tabletop). Concentration has no art by design and always stays a pip.
//
// Assets are bundled UI images (src/assets/conditions/<lowercase>.webp), hashed
// and inlined/served by Vite — NOT the Storage bucket (those are user map data).
const urls = import.meta.glob('../assets/conditions/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const BY_KEY: Record<string, string> = {}
for (const [path, url] of Object.entries(urls)) {
  const key = path.slice(path.lastIndexOf('/') + 1).replace('.webp', '')
  BY_KEY[key] = url
}

/** Cover art URL for a condition name (case-insensitive), or undefined if none. */
export function conditionArt(name: string): string | undefined {
  return BY_KEY[name.toLowerCase()]
}

// The source frames share one geometry: a half-disc whose flat (diameter) edge
// is the top, with opaque content 2011×1072 after cropping. So one aspect ratio
// positions every cover: width = token diameter, placed with its flat edge on
// the token's center line.
export const COVER_ASPECT = 1072 / 2011

/**
 * Where to draw a cover on a token of radius `r` (token-local units, centred on 0,0).
 * T-116: the art is a half-disc plus a name plate, so it is slightly taller than half its
 * width (COVER_ASPECT > 0.5). Sizing it to the full token width (the old rule) pushed the
 * plate below the token and laid the rim over the outline ring. Instead the whole frame
 * (flat edge, rim and plate) fits inside the ring's inner edge: its height is the inner
 * radius, and its width follows from the aspect, so the ring stays fully visible.
 * `r` is the radius the outline is drawn at; the ring is `ringWidth` wide, centred on it.
 */
export function coverBox(r: number, ringWidth: number): { x: number; y: number; width: number; height: number } {
  const inner = Math.max(0, r - ringWidth / 2)
  const height = inner
  const width = height / COVER_ASPECT
  return { x: -width / 2, y: 0, width, height }
}

// When several conditions are active, the most mechanically dominant one wins
// the single cover slot; the rest fall back to pips. Order is severity-ish and
// easy to tweak. Anything not listed (e.g. Concentration) never takes the cover.
const COVER_PRIORITY = [
  'Unconscious', 'Paralyzed', 'Petrified', 'Stunned', 'Incapacitated',
  'Prone', 'Restrained', 'Grappled', 'Frightened', 'Charmed',
  'Poisoned', 'Blinded', 'Deafened', 'Invisible', 'Exhaustion',
]

/** The highest-priority active condition that has cover art, or undefined. */
export function coverCondition(conditions: string[]): string | undefined {
  let best: string | undefined
  let bestRank = Infinity
  for (const c of conditions) {
    if (!conditionArt(c)) continue
    const rank = COVER_PRIORITY.indexOf(c)
    const r = rank === -1 ? COVER_PRIORITY.length : rank
    if (r < bestRank) {
      bestRank = r
      best = c
    }
  }
  return best
}
