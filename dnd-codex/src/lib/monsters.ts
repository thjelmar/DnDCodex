import srdData from '../data/srdMonsters.json'

// Monster data for the encounter builder + (later) combat tracker.
//
// Two sources, per the design decision:
// - BUNDLED SRD (src/data/srdMonsters.json): ~322 openly-licensed SRD monsters
//   compiled from Open5e. Works fully offline; no network, no CORS.
// - LIVE Open5e (api.open5e.com): optional "search more online" for monsters
//   beyond the SRD (also openly licensed). CORS-open, so we can fetch directly.

export interface Monster {
  slug: string
  name: string
  size: string
  type: string
  /** Challenge rating as a number (0.125 = 1/8, etc.). */
  cr: number
  /** Hit points (for the combat tracker). */
  hp: number | null
  /** Armor class. */
  ac: number | null
  /** Dexterity score (initiative modifier for the combat tracker). */
  dex: number | null
  /** Where this record came from. */
  source: 'srd' | 'open5e'
}

export const SRD_MONSTERS: Monster[] = (srdData as Omit<Monster, 'source'>[]).map((m) => ({
  ...m,
  source: 'srd' as const,
}))

// --- CR ↔ XP -------------------------------------------------------------

const CR_XP: Record<number, number> = {
  0: 10,
  0.125: 25,
  0.25: 50,
  0.5: 100,
  1: 200,
  2: 450,
  3: 700,
  4: 1100,
  5: 1800,
  6: 2300,
  7: 2900,
  8: 3900,
  9: 5000,
  10: 5900,
  11: 7200,
  12: 8400,
  13: 10000,
  14: 11500,
  15: 13000,
  16: 15000,
  17: 18000,
  18: 20000,
  19: 22000,
  20: 25000,
  21: 33000,
  22: 41000,
  23: 50000,
  24: 62000,
  25: 75000,
  26: 90000,
  27: 105000,
  28: 120000,
  29: 135000,
  30: 155000,
}

/** XP value for a challenge rating (0 if unknown). */
export function crToXp(cr: number): number {
  return CR_XP[cr] ?? 0
}

/** Human label for a CR: 0.125 → "1/8", 3 → "3". */
export function crLabel(cr: number): string {
  if (cr === 0.125) return '1/8'
  if (cr === 0.25) return '1/4'
  if (cr === 0.5) return '1/2'
  return String(cr)
}

/** All CR values present in the SRD set, ascending — for filter dropdowns. */
export const CR_VALUES: number[] = Object.keys(CR_XP)
  .map(Number)
  .sort((a, b) => a - b)

// --- Search --------------------------------------------------------------

export interface MonsterFilter {
  query?: string
  minCr?: number
  maxCr?: number
}

/** Filter the bundled SRD set (instant, offline). */
export function searchSrd({ query, minCr, maxCr }: MonsterFilter): Monster[] {
  const q = query?.trim().toLowerCase()
  return SRD_MONSTERS.filter((m) => {
    if (q && !m.name.toLowerCase().includes(q) && !m.type.toLowerCase().includes(q)) return false
    if (minCr != null && m.cr < minCr) return false
    if (maxCr != null && m.cr > maxCr) return false
    return true
  })
}

interface Open5eRow {
  slug: string
  name: string
  size?: string
  type?: string
  cr?: number
  hit_points?: number
  armor_class?: number
  dexterity?: number
}

/**
 * Live search across ALL of Open5e (not just the SRD document). Used for the
 * optional "search more online" action. Throws on network error so the caller
 * can fall back to the offline set.
 */
export async function searchOpen5e(query: string): Promise<Monster[]> {
  const url = `https://api.open5e.com/v1/monsters/?limit=50&search=${encodeURIComponent(query.trim())}`
  // Bound the request so a slow/blocked network fails gracefully instead of
  // leaving the UI stuck "Searching…" forever.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  let res: Response
  try {
    res = await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`Open5e request failed (${res.status})`)
  const data: { results?: Open5eRow[] } = await res.json()
  return (data.results ?? []).map((m) => ({
    slug: m.slug,
    name: m.name,
    size: m.size ?? '',
    type: m.type ?? '',
    cr: m.cr ?? 0,
    hp: m.hit_points ?? null,
    ac: m.armor_class ?? null,
    dex: m.dexterity ?? null,
    source: 'open5e' as const,
  }))
}
