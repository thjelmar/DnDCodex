import type { LocationType } from '../db/types'

// A one-click settlement generator: it fills a town/village/city's structured
// fields with a *coherent* set, built from chained ("call and response") rolls
// where the settlement tier constrains everything size-correlated. The tier
// fixes the population band, and the population band fixes how many — and which
// kinds of — points of interest the place has, so a village can never roll a
// city's numbers. Everything here is pure (no DB, no React) so the editor can
// preview, re-roll, and apply it.

export type SettlementTier = 'hamlet' | 'village' | 'town' | 'city'

interface TierDef {
  key: SettlementTier
  label: string
  /** Population band — the rolled population always lands inside it. */
  popMin: number
  popMax: number
  /** Round the rolled population to this step (bigger places read rounder). */
  popStep: number
  /** How many points of interest a place this size has. */
  poiMin: number
  poiMax: number
}

export const SETTLEMENT_TIERS: TierDef[] = [
  { key: 'hamlet', label: 'Hamlet', popMin: 20, popMax: 90, popStep: 10, poiMin: 1, poiMax: 2 },
  { key: 'village', label: 'Village', popMin: 100, popMax: 900, popStep: 50, poiMin: 2, poiMax: 4 },
  { key: 'town', label: 'Town', popMin: 1000, popMax: 5000, popStep: 100, poiMin: 4, poiMax: 7 },
  { key: 'city', label: 'City', popMin: 6000, popMax: 22000, popStep: 500, poiMin: 7, poiMax: 12 },
]

const TIER_BY_KEY: Record<SettlementTier, TierDef> = Object.fromEntries(
  SETTLEMENT_TIERS.map((t) => [t.key, t]),
) as Record<SettlementTier, TierDef>

/** The tier to default to for a location of this type. */
export function tierForType(type: LocationType): SettlementTier {
  if (type === 'city') return 'city'
  if (type === 'village') return 'village'
  return 'town' // town, and any non-settlement the DM points at it
}

const rng = (n: number) => Math.floor(Math.random() * n)
const pick = <T>(xs: readonly T[]): T => xs[rng(xs.length)]
const intIn = (min: number, max: number) => min + rng(max - min + 1)
/** `n` distinct picks from `xs` (or all of them if `n` exceeds the list). */
function sample<T>(xs: readonly T[], n: number): T[] {
  const pool = [...xs]
  const out: T[] = []
  while (out.length < n && pool.length) out.push(pool.splice(rng(pool.length), 1)[0])
  return out
}
/** Pick by weight: higher weight = more likely. */
function weighted<T>(xs: readonly { v: T; w: number }[]): T {
  const total = xs.reduce((s, x) => s + x.w, 0)
  let r = Math.random() * total
  for (const x of xs) if ((r -= x.w) < 0) return x.v
  return xs[xs.length - 1].v
}

// --- Word lists (built-in defaults; a later pass can let a world override
//     these with its own roll tables) --------------------------------------

const PROSPERITY_WEIGHTED = [
  { v: 'Thriving', w: 2 },
  { v: 'Prosperous', w: 4 },
  { v: 'Stable', w: 6 },
  { v: 'Struggling', w: 4 },
  { v: 'Impoverished', w: 2 },
  { v: 'Ruined', w: 1 },
]

const GOVERNMENT: Record<SettlementTier, string[]> = {
  hamlet: ['Elected headman', 'Eldest family', 'No formal leader'],
  village: ['Elected headman', 'Council of elders', 'Hereditary reeve', 'The local lord’s steward'],
  town: ['Town council', 'Appointed mayor', 'Merchant guild', 'The lord’s steward', 'Militia captain'],
  city: ['Lord mayor and council', 'Merchant princes', 'A noble house', 'Theocratic council', 'Guild coalition'],
}

const DEITIES = [
  'the Dawnmother', 'the Forge-Lord', 'the Green Lady', 'the Pale Watcher', 'the Tidefather',
  'the Twin Flames', 'the Harvest Saint', 'the Grey Pilgrim', 'the Stormcaller', 'the Hearthkeeper',
]
const RELIGION_SHAPES = [
  () => `Devout to ${pick(DEITIES)}`,
  () => `Shrines to ${pick(DEITIES)} and ${pick(DEITIES)}`,
  () => `Old faith of ${pick(DEITIES)}`,
  () => `Mixed; ${pick(DEITIES)} most honored`,
  () => `Little worship; a quiet cult of ${pick(DEITIES)}`,
]

const TRADE_GOODS = [
  'grain', 'iron', 'timber', 'wool', 'fish', 'salt', 'wine', 'ale', 'leather', 'pottery',
  'furs', 'ore', 'spices', 'cloth', 'horses', 'cut stone', 'charcoal', 'honey', 'cheese', 'tools',
]

// Points of interest. `tiers` = the smallest tier that can have it; `unique`
// kinds appear at most once (a city has one cathedral but many taverns).
interface PoiKind {
  kind: string
  minTier: SettlementTier
  unique?: boolean
  /** Weight within its tier pool (taverns/shops are common). */
  w: number
  name: (ctx: { settlement: string }) => string
}

const TIER_ORDER: SettlementTier[] = ['hamlet', 'village', 'town', 'city']
const tierRank = (t: SettlementTier) => TIER_ORDER.indexOf(t)

const TAVERN_ADJ = ['Rusty', 'Prancing', 'Gilded', 'Drowned', 'Laughing', 'Silver', 'Crooked', 'Salty', 'Weary', 'Wild']
const TAVERN_NOUN = ['Tankard', 'Pony', 'Griffon', 'Lantern', 'Anchor', 'Hart', 'Crown', 'Barrel', 'Dragon', 'Rose']
const SURNAMES = ['Holt', 'Vance', 'Mercer', 'Thorne', 'Ashby', 'Crane', 'Harlow', 'Quill', 'Dunmore', 'Bevan', 'Oswin', 'Faring']
const FIRST_NAMES = ['Mara', 'Edrin', 'Sella', 'Bram', 'Yorick', 'Nessa', 'Corin', 'Hale', 'Dara', 'Pell', 'Rowan', 'Isolde']
const personName = () => `${pick(FIRST_NAMES)} ${pick(SURNAMES)}`

const POI_KINDS: PoiKind[] = [
  { kind: 'Tavern', minTier: 'hamlet', w: 5, name: () => `The ${pick(TAVERN_ADJ)} ${pick(TAVERN_NOUN)}` },
  { kind: 'Smithy', minTier: 'hamlet', w: 3, name: () => `${pick(SURNAMES)}’s Forge` },
  { kind: 'General store', minTier: 'hamlet', w: 3, name: () => `${pick(SURNAMES)}’s Goods` },
  { kind: 'Shrine', minTier: 'hamlet', w: 2, name: () => `Shrine of ${pick(DEITIES)}` },
  { kind: 'Mill', minTier: 'hamlet', w: 2, name: () => `The ${pick(['Old', 'Low', 'River', 'Wind'])} Mill` },
  { kind: 'Stable', minTier: 'village', w: 2, name: () => `${pick(SURNAMES)}’s Stables` },
  { kind: 'Market', minTier: 'village', w: 3, name: () => `The ${pick(['Market Square', 'Weekly Market', 'Trade Row'])}` },
  { kind: 'Apothecary', minTier: 'village', w: 2, name: () => `${pick(FIRST_NAMES)}’s Remedies` },
  { kind: 'Temple', minTier: 'town', w: 2, name: () => `Temple of ${pick(DEITIES)}` },
  { kind: 'Guild hall', minTier: 'town', w: 2, name: () => `Hall of the ${pick(['Masons', 'Weavers', 'Merchants', 'Smiths', 'Brewers'])}` },
  { kind: 'Barracks', minTier: 'town', unique: true, w: 1, name: () => `The Watch Barracks` },
  { kind: 'Bathhouse', minTier: 'town', w: 1, name: () => `The ${pick(['Steaming', 'Copper', 'Marble'])} Baths` },
  { kind: 'Moneylender', minTier: 'town', w: 1, name: () => `${pick(SURNAMES)} and Sons, Lending` },
  { kind: 'Cathedral', minTier: 'city', unique: true, w: 2, name: () => `Grand Cathedral of ${pick(DEITIES)}` },
  { kind: 'Arena', minTier: 'city', unique: true, w: 1, name: () => `The ${pick(['Old', 'Grand', 'Bloodied'])} Arena` },
  { kind: 'Library', minTier: 'city', unique: true, w: 1, name: () => `The ${pick(['Archives', 'Great Library', 'Athenaeum'])}` },
  { kind: 'Thieves’ den', minTier: 'city', w: 1, name: () => `A hidden den beneath ${pick(['the docks', 'the slums', 'an old temple'])}` },
]

export interface GeneratedSettlement {
  tier: SettlementTier
  population: string
  prosperity: string
  government: string
  religion: string
  imports: string
  exports: string
  leaderName: string
  pois: { kind: string; name: string }[]
  hooks: string[]
}

// Per-piece rolls, so the editor can re-roll one line without disturbing the
// rest. `generateSettlement` just composes them.

export function rollPopulation(tier: SettlementTier): string {
  const def = TIER_BY_KEY[tier]
  const raw = intIn(def.popMin, def.popMax)
  const pop = Math.max(def.popMin, Math.round(raw / def.popStep) * def.popStep)
  return `~${pop.toLocaleString()}`
}
export const rollProsperity = () => weighted(PROSPERITY_WEIGHTED.map((x) => ({ v: x.v, w: x.w })))
export const rollGovernment = (tier: SettlementTier) => pick(GOVERNMENT[tier])
export const rollReligion = () => pick(RELIGION_SHAPES)()
export const rollTradeList = () => sample(TRADE_GOODS, intIn(2, 3)).join(', ')
export const rollLeaderName = () => personName()

/** One point of interest for the tier, avoiding a unique kind already present. */
export function rollPoi(tier: SettlementTier, existing: { kind: string }[] = []): { kind: string; name: string } {
  const pool = POI_KINDS.filter((k) => tierRank(k.minTier) <= tierRank(tier))
  const usedUnique = new Set(existing.map((e) => e.kind))
  for (let i = 0; i < 24; i++) {
    const k = weighted(pool.map((x) => ({ v: x, w: x.w })))
    if (k.unique && usedUnique.has(k.kind)) continue
    return { kind: k.kind, name: k.name({ settlement: '' }) }
  }
  const k = pool[0]
  return { kind: k.kind, name: k.name({ settlement: '' }) }
}

/** One hook, avoiding any already in the list. */
export function rollHook(existing: string[] = []): string {
  for (let i = 0; i < 24; i++) {
    const h = pick(HOOKS)
    if (!existing.includes(h)) return h
  }
  return pick(HOOKS)
}

const HOOKS = [
  'Livestock have been vanishing from the outlying farms at night.',
  'The local leader owes a dangerous debt and is desperate.',
  'A stranger has been asking pointed questions about the old ruins nearby.',
  'Two families are feuding and the whole place is taking sides.',
  'The well water has turned foul and no one knows why.',
  'A caravan is overdue and its backers are offering coin for news.',
  'Someone has been leaving strange marks on doors after dark.',
  'The shrine’s relic was stolen during the last festival.',
]

export function generateSettlement(tier: SettlementTier): GeneratedSettlement {
  const def = TIER_BY_KEY[tier]
  // Population: inside the tier band, rounded to the tier's step.
  const raw = intIn(def.popMin, def.popMax)
  const pop = Math.max(def.popMin, Math.round(raw / def.popStep) * def.popStep)

  // Points of interest: a tier-bounded count, drawn from the kinds this size
  // (or smaller) can have; unique kinds appear at most once.
  const count = intIn(def.poiMin, def.poiMax)
  const pool = POI_KINDS.filter((k) => tierRank(k.minTier) <= tierRank(tier))
  const pois: { kind: string; name: string }[] = []
  const usedUnique = new Set<string>()
  let guard = 0
  while (pois.length < count && guard++ < count * 8) {
    const k = weighted(pool.map((x) => ({ v: x, w: x.w })))
    if (k.unique && usedUnique.has(k.kind)) continue
    if (k.unique) usedUnique.add(k.kind)
    pois.push({ kind: k.kind, name: k.name({ settlement: '' }) })
  }

  const [imp, exp] = [sample(TRADE_GOODS, intIn(2, 3)), sample(TRADE_GOODS, intIn(2, 3))]

  return {
    tier,
    population: `~${pop.toLocaleString()}`,
    prosperity: weighted(PROSPERITY_WEIGHTED.map((x) => ({ v: x.v, w: x.w }))),
    government: pick(GOVERNMENT[tier]),
    religion: pick(RELIGION_SHAPES)(),
    imports: imp.join(', '),
    exports: exp.join(', '),
    leaderName: personName(),
    pois,
    hooks: sample(HOOKS, tier === 'hamlet' ? 1 : 2),
  }
}

/**
 * Re-fit an existing roll to a new tier, touching ONLY the pieces the new tier's
 * rules make incorrect — so changing the settlement size doesn't discard edits
 * to the size-independent fields (religion, trade, leader, hooks, prosperity).
 *   - population always re-rolls (the bands don't overlap)
 *   - leadership re-rolls only if the current one isn't used at this tier
 *   - points of interest: any whose kind this tier can't have are re-rolled,
 *     then the count is clamped into the tier's range
 */
export function reconcileToTier(gen: GeneratedSettlement, tier: SettlementTier): GeneratedSettlement {
  const def = TIER_BY_KEY[tier]
  const allowed = (kind: string) => {
    const k = POI_KINDS.find((x) => x.kind === kind)
    return k ? tierRank(k.minTier) <= tierRank(tier) : true
  }
  const pois: { kind: string; name: string }[] = []
  for (const p of gen.pois) pois.push(allowed(p.kind) ? p : rollPoi(tier, pois))
  while (pois.length > def.poiMax) pois.pop()
  while (pois.length < def.poiMin) pois.push(rollPoi(tier, pois))
  return {
    ...gen,
    tier,
    population: rollPopulation(tier),
    government: GOVERNMENT[tier].includes(gen.government) ? gen.government : rollGovernment(tier),
    pois,
  }
}

/** The generated points of interest as a list for the rich-text POI field. */
export function poisToHtml(pois: { kind: string; name: string }[]): string {
  const items = pois.map((p) => `<li><strong>${esc(p.name)}</strong> — ${esc(p.kind.toLowerCase())}</li>`).join('')
  return `<ul>${items}</ul>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
