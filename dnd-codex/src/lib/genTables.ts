import type { GenTable, RollTableEntry, DismissedSuggestion } from '../db/types'

// Per-world generator tables. The one-click generators (settlement, tavern name,
// plot hook, NPC name) ship with built-in word lists, but a DM can override any
// of them per campaign with their own roll table: seed editable copies of the
// built-ins (see `generatorTableSeeds`), then edit them on the Roll Tables page.
// A table is bound to a slot by its `generatorSlot` field — not its name — so the
// DM can rename it freely. When a slot has a non-empty bound table, the generator
// draws from it instead of the built-in list; otherwise the built-in is used.
//
// The tier-bound *numbers* (population bands, how many / which kinds of points of
// interest) are rules, not word lists, and stay built-in — that's what keeps a
// village from rolling city-sized.

export type GenSlot =
  | 'tavern-name'
  | 'plot-hook'
  | 'npc-name'
  | 'settlement-government'
  | 'settlement-religion'
  | 'settlement-trade'
  | 'settlement-prosperity'

export interface WeightedText {
  text: string
  weight?: number
}

export interface GenSlotDef {
  slot: GenSlot
  /** Default table name when seeded (the DM may rename it). */
  name: string
  /** One-line hint shown by the slot. */
  blurb: string
  /** Built-in starter list — also the reservoir the suggestion pass draws from. */
  builtins: WeightedText[]
}

/** Category all seeded generator tables share, so they group together. */
export const GEN_TABLE_CATEGORY = 'Generators'

/** Milliseconds in ~6 months — the minimum a pending suggestion is kept. */
export const SUGGESTION_TTL_MS = 183 * 24 * 60 * 60 * 1000

const GOVERNMENT = [
  'Elected headman',
  'Eldest family',
  'No formal leader',
  'Council of elders',
  'Hereditary reeve',
  'The local lord’s steward',
  'Town council',
  'Appointed mayor',
  'Merchant guild',
  'Militia captain',
  'Lord mayor and council',
  'Merchant princes',
  'A noble house',
  'Theocratic council',
  'Guild coalition',
]

const RELIGION = [
  'Devout to the Dawnmother',
  'Shrines to the Forge-Lord and the Green Lady',
  'Old faith of the Pale Watcher',
  'Mixed; the Tidefather most honored',
  'Little worship; a quiet cult of the Grey Pilgrim',
  'Devout to the Harvest Saint',
  'Shrines to the Twin Flames',
  'Old faith of the Stormcaller',
]

const TRADE_GOODS = [
  'grain', 'iron', 'timber', 'wool', 'fish', 'salt', 'wine', 'ale', 'leather', 'pottery',
  'furs', 'ore', 'spices', 'cloth', 'horses', 'cut stone', 'charcoal', 'honey', 'cheese', 'tools',
]

const PROSPERITY: WeightedText[] = [
  { text: 'Thriving', weight: 2 },
  { text: 'Prosperous', weight: 4 },
  { text: 'Stable', weight: 6 },
  { text: 'Struggling', weight: 4 },
  { text: 'Impoverished', weight: 2 },
  { text: 'Ruined', weight: 1 },
]

const TAVERN_NAMES = [
  'The Rusty Tankard', 'The Prancing Pony', 'The Gilded Griffon', 'The Drowned Lantern',
  'The Laughing Hart', 'The Silver Crown', 'The Crooked Barrel', 'The Salty Anchor',
  'The Weary Dragon', 'The Wild Rose', 'The Sleeping Boar', 'The Golden Kettle',
  'The Broken Mermaid', 'The Hungry Whistle',
]

const NPC_NAMES = [
  'Mara Holt', 'Edrin Vance', 'Sella Mercer', 'Bram Thorne', 'Yorick Ashby', 'Nessa Crane',
  'Corin Harlow', 'Hale Quill', 'Dara Dunmore', 'Pell Bevan', 'Rowan Oswin', 'Isolde Faring',
  'Garret Marsh', 'Linnea Calder', 'Tomas Winters', 'Verity Rook',
]

const PLOT_HOOKS = [
  'Livestock have been vanishing from the outlying farms at night.',
  'The local leader owes a dangerous debt and is desperate.',
  'A stranger has been asking pointed questions about the old ruins nearby.',
  'Two families are feuding and the whole place is taking sides.',
  'The well water has turned foul and no one knows why.',
  'A caravan is overdue and its backers are offering coin for news.',
  'Someone has been leaving strange marks on doors after dark.',
  'The shrine’s relic was stolen during the last festival.',
]

const toW = (xs: string[]): WeightedText[] => xs.map((text) => ({ text }))

export const GEN_SLOTS: GenSlotDef[] = [
  { slot: 'tavern-name', name: 'Tavern Names', blurb: 'Inn & tavern names', builtins: toW(TAVERN_NAMES) },
  { slot: 'plot-hook', name: 'Plot Hooks', blurb: 'Rumors & adventure seeds', builtins: toW(PLOT_HOOKS) },
  { slot: 'npc-name', name: 'NPC Names', blurb: 'Default (human) person names', builtins: toW(NPC_NAMES) },
  { slot: 'settlement-government', name: 'Settlement: Government', blurb: 'How a settlement is ruled', builtins: toW(GOVERNMENT) },
  { slot: 'settlement-religion', name: 'Settlement: Religion', blurb: 'Dominant faiths', builtins: toW(RELIGION) },
  { slot: 'settlement-trade', name: 'Settlement: Trade Goods', blurb: 'Imports & exports', builtins: toW(TRADE_GOODS) },
  { slot: 'settlement-prosperity', name: 'Settlement: Prosperity', blurb: 'Weighted wealth levels', builtins: PROSPERITY },
]

const SLOT_SET = new Set<string>(GEN_SLOTS.map((s) => s.slot))
export const isGenSlot = (v: unknown): v is GenSlot => typeof v === 'string' && SLOT_SET.has(v)
export const genSlotDef = (slot: GenSlot): GenSlotDef => GEN_SLOTS.find((s) => s.slot === slot)!

export type GenOverrides = Partial<Record<GenSlot, WeightedText[]>>

/** Build the override map from the global generator tables — only slots with at
 *  least one entry count (an empty / absent table falls back to the built-in). */
export function overridesFromGenTables(tables: readonly GenTable[] | undefined): GenOverrides {
  const ov: GenOverrides = {}
  if (!tables) return ov
  for (const t of tables) {
    if (!isGenSlot(t.slot)) continue
    const entries = t.entries.filter((e) => e.text.trim())
    if (entries.length) ov[t.slot] = entries.map((e) => ({ text: e.text, weight: e.weight }))
  }
  return ov
}

/** The effective entries for a slot: the global table's rows, or the built-ins
 *  when the slot has no table yet (used to seed the editor on first open). */
export function effectiveEntries(slot: GenSlot, table: GenTable | undefined, makeEntry: (text: string, weight: number) => RollTableEntry): RollTableEntry[] {
  if (table && table.entries.length) return table.entries
  return genSlotDef(slot).builtins.map((b) => makeEntry(b.text, b.weight ?? 1))
}

const normW = (w?: number) => Math.max(1, Math.floor(w || 1))

/** One weighted pick from a list of candidates (built-in or override). */
export function pickText(list: readonly WeightedText[]): string {
  const total = list.reduce((s, x) => s + normW(x.weight), 0)
  let r = Math.random() * total
  for (const x of list) if ((r -= normW(x.weight)) < 0) return x.text
  return list[list.length - 1].text
}

/** `n` distinct picks (ignores weights for distinctness — used for trade lists). */
export function sampleText(list: readonly WeightedText[], n: number): string[] {
  const pool = list.map((x) => x.text)
  const out: string[] = []
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  return out
}

// --- Suggestions -----------------------------------------------------------
// A generator table auto-grows a review list: any built-in value this world's
// table doesn't have yet is offered for the DM to confirm (so new word-list
// data from an app update surfaces without silently over-writing their list).
// Pending items are DERIVED — the built-in reservoir minus the table's entries
// minus still-active dismissals — so only dismissals persist, each with the
// retention window after which it lapses and can be offered again.

interface SuggestionInput {
  slot: string
  entries: RollTableEntry[]
  dismissedSuggestions?: DismissedSuggestion[]
}

/** Dismissals still inside the retention window, as a Set of their text. */
export function activeDismissed(table: Pick<SuggestionInput, 'dismissedSuggestions'>, nowMs = Date.now()): Set<string> {
  const set = new Set<string>()
  for (const d of table.dismissedSuggestions ?? []) {
    if (nowMs - Date.parse(d.dismissedAt) < SUGGESTION_TTL_MS) set.add(d.text)
  }
  return set
}

/** The built-in values this generator table is missing and hasn't dismissed —
 *  the pending "add any/all?" list. Empty if the slot isn't a known generator. */
export function pendingSuggestions(table: SuggestionInput, nowMs = Date.now()): string[] {
  if (!isGenSlot(table.slot)) return []
  const def = genSlotDef(table.slot)
  const have = new Set(table.entries.map((e) => e.text.trim()).filter(Boolean))
  const dismissed = activeDismissed(table, nowMs)
  return def.builtins.map((b) => b.text).filter((t) => !have.has(t) && !dismissed.has(t))
}

/** Drop dismissals that have aged out of the retention window. */
export function prunedDismissals(
  table: Pick<SuggestionInput, 'dismissedSuggestions'>,
  nowMs = Date.now(),
): DismissedSuggestion[] {
  return (table.dismissedSuggestions ?? []).filter((d) => nowMs - Date.parse(d.dismissedAt) < SUGGESTION_TTL_MS)
}

/** Pending built-ins for a slot. A slot with no saved table isn't "customized"
 *  yet (it just uses the built-ins), so it has nothing to suggest. */
export function pendingForSlot(slot: GenSlot, rows: readonly GenTable[] | undefined, nowMs = Date.now()): string[] {
  const row = rows?.find((r) => r.slot === slot)
  return row ? pendingSuggestions(row, nowMs) : []
}

/** Total pending suggestions across every generator slot (for the nav badge). */
export function totalPendingSuggestions(rows: readonly GenTable[] | undefined, nowMs = Date.now()): number {
  return GEN_SLOTS.reduce((n, s) => n + pendingForSlot(s.slot, rows, nowMs).length, 0)
}
