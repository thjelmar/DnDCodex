import type { AbilityKey, StatBlock, StatBlockEntry } from '../db/types'
import type { Monster, Open5eAction, Open5eFullMonster } from './monsters'
import { crToXp, crLabel } from './monsters'

// Helpers for the structured NPC stat block: all the derived numbers (ability
// modifiers, saving throws, proficiency bonus, XP) so the editor and renderer
// stay in sync and the DM never hand-maths a modifier.

export const ABILITIES: { key: AbilityKey; label: string }[] = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
]

/** A fresh, empty stat block (average commoner ability scores). */
export function emptyStatBlock(): StatBlock {
  return {
    size: '',
    creatureType: '',
    alignment: '',
    ac: '',
    hp: '',
    speed: '',
    initiative: '',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [],
    pb: '',
    skills: '',
    resistances: '',
    immunities: '',
    vulnerabilities: '',
    senses: '',
    languages: '',
    cr: '',
    habitat: '',
    gear: '',
    treasure: '',
    traits: [],
    actions: [],
    spellcasting: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    referenceLinks: [],
  }
}

/** Ability modifier for a score: floor((score - 10) / 2). */
export function abilityMod(score: number): number {
  return Math.floor((Number(score) - 10) / 2)
}

/** Render a number with an explicit sign, e.g. 3 → "+3", -1 → "-1". */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/**
 * Parse a CR string ("12", "1/2", "1/8") to a number. Returns null if it isn't
 * a recognizable CR, so callers can hide derived XP/PB.
 */
export function parseCr(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  if (t === '1/8') return 0.125
  if (t === '1/4') return 0.25
  if (t === '1/2') return 0.5
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Standard 5e proficiency bonus for a challenge rating. */
export function pbFromCr(cr: number): number {
  if (cr <= 4) return 2
  if (cr <= 8) return 3
  if (cr <= 12) return 4
  if (cr <= 16) return 5
  if (cr <= 20) return 6
  if (cr <= 24) return 7
  if (cr <= 28) return 8
  return 9
}

/** The effective proficiency bonus: an explicit override, else derived from CR. */
export function effectivePb(block: StatBlock): number {
  const override = Number(block.pb)
  if (block.pb.trim() && Number.isFinite(override)) return override
  const cr = parseCr(block.cr)
  return cr == null ? 2 : pbFromCr(cr)
}

/** Saving-throw bonus for an ability: its modifier plus PB if proficient. */
export function saveValue(block: StatBlock, key: AbilityKey): number {
  const mod = abilityMod(block.abilities[key])
  return block.saveProficiencies.includes(key) ? mod + effectivePb(block) : mod
}

/** XP for the block's CR (0 if the CR isn't recognized). */
export function statBlockXp(block: StatBlock): number {
  const cr = parseCr(block.cr)
  return cr == null ? 0 : crToXp(cr)
}

/** "12 (8,400 XP)" style label for the CR line; empty if no CR. */
export function crXpLabel(block: StatBlock): string {
  const cr = parseCr(block.cr)
  if (cr == null) return block.cr.trim()
  const xp = crToXp(cr)
  return xp ? `${crLabel(cr)} (${xp.toLocaleString()} XP)` : crLabel(cr)
}

/**
 * Seed a stat block from a bundled/live monster record. Only the basics are
 * known (size, type, CR, HP, AC, DEX) — the rest is left for the DM to fill in.
 * Existing DEX drives an initiative suggestion.
 */
export function statBlockFromMonster(m: Monster): StatBlock {
  const block = emptyStatBlock()
  block.size = m.size || ''
  block.creatureType = m.type || ''
  block.cr = crLabel(m.cr)
  block.ac = m.ac != null ? String(m.ac) : ''
  block.hp = m.hp != null ? String(m.hp) : ''
  if (m.dex != null) {
    block.abilities.dex = m.dex
    block.initiative = signed(abilityMod(m.dex))
  }
  return block
}

// --- Full Open5e import --------------------------------------------------

/** Capitalize the first letter (Open5e stores size/type/alignment lowercase). */
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Title-case a skill key like "animal_handling" → "Animal Handling". */
function titleCase(s: string): string {
  return s.split(/[\s_-]+/).filter(Boolean).map(capitalize).join(' ')
}

/** Strip the light Markdown Open5e embeds in its text (**bold**, _italics_,
 *  [links](url), `code`), leaving mid-word underscores like snake_case alone. */
function stripMarkdown(s: string): string {
  if (!s) return s
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/__([^_]+)__/g, '$1') // __bold__
    .replace(/\*([^*]+)\*/g, '$1') // *italic*
    .replace(/(?<![A-Za-z0-9])_([^_]+)_(?![A-Za-z0-9])/g, '$1') // _italic_
    .replace(/`([^`]+)`/g, '$1') // `code`
}

function toEntries(v: Open5eAction[] | string | null | undefined): StatBlockEntry[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((a) => a && (a.name?.trim() || a.desc?.trim()))
    .map((a) => ({ id: crypto.randomUUID(), name: stripMarkdown((a.name ?? '').trim()), text: stripMarkdown((a.desc ?? '').trim()) }))
}

/** "30 ft., fly 60 ft. (hover)" from Open5e's speed object. */
function formatSpeed(speed: Open5eFullMonster['speed']): string {
  if (!speed) return ''
  const hover = speed.hover === true
  const parts: string[] = []
  if (typeof speed.walk === 'number') parts.push(`${speed.walk} ft.`)
  for (const [mode, val] of Object.entries(speed)) {
    if (mode === 'walk' || mode === 'hover') continue
    if (typeof val === 'number') parts.push(`${mode} ${val} ft.${mode === 'fly' && hover ? ' (hover)' : ''}`)
  }
  return parts.join(', ')
}

/** "Perception +7, Stealth +5" from Open5e's skills object. */
function formatSkills(skills: Open5eFullMonster['skills']): string {
  if (!skills) return ''
  return Object.entries(skills)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${titleCase(k)} ${signed(v)}`)
    .join(', ')
}

/**
 * Map a full Open5e monster record into a complete stat block: core stats,
 * ability scores, saves, defenses, and every entry section. A special ability
 * named "Spellcasting" is routed to the spellcasting section (spells are
 * actions). Unknown/absent fields stay empty for the DM to fill.
 */
export function statBlockFromOpen5e(m: Open5eFullMonster): StatBlock {
  const block = emptyStatBlock()
  block.size = capitalize(m.size ?? '')
  block.creatureType = capitalize(m.type ?? '') + (m.subtype ? ` (${m.subtype})` : '')
  block.alignment = capitalize(m.alignment ?? '')
  block.ac = m.armor_class != null ? `${m.armor_class}${m.armor_desc ? ` (${stripMarkdown(m.armor_desc)})` : ''}` : ''
  block.hp = m.hit_points != null ? `${m.hit_points}${m.hit_dice ? ` (${m.hit_dice})` : ''}` : ''
  block.speed = formatSpeed(m.speed)
  block.abilities = {
    str: m.strength ?? 10,
    dex: m.dexterity ?? 10,
    con: m.constitution ?? 10,
    int: m.intelligence ?? 10,
    wis: m.wisdom ?? 10,
    cha: m.charisma ?? 10,
  }
  const saves: [AbilityKey, number | null | undefined][] = [
    ['str', m.strength_save], ['dex', m.dexterity_save], ['con', m.constitution_save],
    ['int', m.intelligence_save], ['wis', m.wisdom_save], ['cha', m.charisma_save],
  ]
  block.saveProficiencies = saves.filter(([, v]) => v != null).map(([k]) => k)
  block.skills = formatSkills(m.skills)
  block.resistances = stripMarkdown(m.damage_resistances ?? '')
  block.immunities = [m.damage_immunities, m.condition_immunities].filter((s) => s && s.trim()).map((s) => stripMarkdown(s!)).join('; ')
  block.vulnerabilities = stripMarkdown(m.damage_vulnerabilities ?? '')
  block.senses = stripMarkdown(m.senses ?? '')
  block.languages = stripMarkdown(m.languages ?? '')
  block.cr = m.cr != null ? crLabel(m.cr) : (m.challenge_rating ?? '')

  // Split special abilities: a Spellcasting trait goes to the spells section.
  const traits: StatBlockEntry[] = []
  const spellcasting: StatBlockEntry[] = []
  for (const a of toEntries(m.special_abilities)) {
    ;(/spellcasting/i.test(a.name) ? spellcasting : traits).push(a)
  }
  block.traits = traits
  block.spellcasting = spellcasting
  block.actions = toEntries(m.actions)
  block.bonusActions = toEntries(m.bonus_actions)
  block.reactions = toEntries(m.reactions)
  const legendary = toEntries(m.legendary_actions)
  if (m.legendary_desc?.trim() && legendary.length) {
    legendary.unshift({ id: crypto.randomUUID(), name: '', text: stripMarkdown(m.legendary_desc.trim()) })
  }
  block.legendaryActions = legendary
  return block
}

// --- Paste import (parse a stat block from copied text) ------------------

type EntrySectionKey = 'traits' | 'actions' | 'spellcasting' | 'bonusActions' | 'reactions' | 'legendaryActions'

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const ABILITY_WORD: Record<AbilityKey, RegExp> = {
  str: /^(str|strength)\b/i, dex: /^(dex|dexterity)\b/i, con: /^(con|constitution)\b/i,
  int: /^(int|intelligence)\b/i, wis: /^(wis|wisdom)\b/i, cha: /^(cha|charisma)\b/i,
}
const ABILITY_TOKEN = /\b(str|dex|con|int|wis|cha|strength|dexterity|constitution|intelligence|wisdom|charisma)\b/gi
const ABILITY_ABBR: Record<string, AbilityKey> = {
  str: 'str', strength: 'str', dex: 'dex', dexterity: 'dex', con: 'con', constitution: 'con',
  int: 'int', intelligence: 'int', wis: 'wis', wisdom: 'wis', cha: 'cha', charisma: 'cha',
}

// Section headers, longest/most-specific first so "Bonus Actions" and "Legendary
// Actions" win over a bare "Actions".
const PASTE_SECTIONS: { re: RegExp; key: EntrySectionKey }[] = [
  { re: /^legendary actions?\b/i, key: 'legendaryActions' },
  { re: /^bonus actions?\b/i, key: 'bonusActions' },
  { re: /^reactions?\b/i, key: 'reactions' },
  { re: /^actions?\b/i, key: 'actions' },
  { re: /^traits?\b/i, key: 'traits' },
]
const PASTE_FIELD = /^(armor class|ac|hit points|hp|speed|initiative|skills|saving throws|saves|damage (vulnerabilities|resistances|immunities)|condition immunities|vulnerabilities|resistances|immunities|senses|languages|challenge|cr|proficiency bonus|pb|gear|habitat|treasure|mod|save|score)\b/i
const SIZE_RE = /^(tiny|small|medium|large|huge|gargantuan)\b\s*(.*)$/i
/** An entry begins with a short "Name." lead-in (optionally "Name (Recharge…).") */
const ENTRY_NAME_RE = /^[A-Z][A-Za-z0-9 ,'’()\-/+]{0,58}?\.(\s|$)/
const ABILITY_HEADER_RE = /\bstr\b[\s\S]*\bdex\b[\s\S]*\bcon\b[\s\S]*\bint\b[\s\S]*\bwis\b[\s\S]*\bcha\b/i
const ABILITY_VALUE_RE = /^\d+\s*\(?[+-]\d+\)?\s*$/

/** Pull the first labeled value off a line, e.g. "AC 17" with ["AC"] → "17". */
function fieldValue(line: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`^${label}\\b[:\\s]*`, 'i')
    if (re.test(line)) return line.replace(re, '').trim()
  }
  return null
}

/** Ability keys named in a "Saving Throws" line → treated as save-proficient. */
function parseSaveProficiencies(value: string): AbilityKey[] {
  const out = new Set<AbilityKey>()
  for (const m of value.matchAll(ABILITY_TOKEN)) {
    const key = ABILITY_ABBR[m[1].toLowerCase()]
    if (key) out.add(key)
  }
  return [...out]
}

/** Just the CR token from "Challenge 12 (8,400 XP)" or "CR 1/2 (…)". */
function extractCr(value: string): string {
  const m = value.match(/\s*([0-9]+\s*\/\s*[0-9]+|[0-9]+)/)
  return m ? m[1].replace(/\s+/g, '') : value.trim()
}

/** Fill ability scores (and 2024-table save proficiencies) from the stat lines. */
function parseAbilities(lines: string[], block: StatBlock): void {
  // Single-line inline: "STR 18 (+4) DEX 15 (+2) CON 16 (+3) …" — label then
  // score for all six on one line. Mapped by label, so order doesn't matter.
  const inlineLine = lines.find((l) => ABILITY_HEADER_RE.test(l) && /\d/.test(l))
  if (inlineLine) {
    let filled = false
    for (const m of inlineLine.matchAll(/\b(str|dex|con|int|wis|cha|strength|dexterity|constitution|intelligence|wisdom|charisma)\b\s*\(?\s*(\d+)/gi)) {
      const key = ABILITY_ABBR[m[1].toLowerCase()]
      if (key) { block.abilities[key] = parseInt(m[2], 10); filled = true }
    }
    if (filled) return
  }
  // Two-line inline: a "STR DEX CON INT WIS CHA" header, scores on the next line.
  const headerIdx = lines.findIndex((l) => ABILITY_HEADER_RE.test(l) && !/\d/.test(l))
  if (headerIdx !== -1 && headerIdx + 1 < lines.length) {
    const scores = [...lines[headerIdx + 1].matchAll(/(\d+)\s*\(?[+-]\d+\)?/g)].map((g) => parseInt(g[1], 10))
    if (scores.length >= 6) {
      ABILITY_KEYS.forEach((k, i) => { block.abilities[k] = scores[i] })
      return
    }
  }
  // Per-ability lines: "STR 10 +0 +0" (2024 table) or a label line then a value.
  for (const key of ABILITY_KEYS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!ABILITY_WORD[key].test(line)) continue
      const inline = line.match(/^[a-z]+\s+(\d+)\s*(?:\(?([+-]\d+)\)?)?\s*(?:\(?([+-]\d+)\)?)?/i)
      if (inline?.[1]) {
        block.abilities[key] = parseInt(inline[1], 10)
        if (inline[2] && inline[3] && inline[2] !== inline[3] && !block.saveProficiencies.includes(key)) {
          block.saveProficiencies.push(key)
        }
        break
      }
      // Stacked: the label is alone on its line, the score begins the next line.
      if (/^[a-z]+\s*$/i.test(line) && i + 1 < lines.length) {
        const nm = lines[i + 1].match(/^(\d+)/)
        if (nm) { block.abilities[key] = parseInt(nm[1], 10); break }
      }
    }
  }
}

/** Whether a line is just a section header (the header word, maybe a colon). */
function sectionFor(line: string): EntrySectionKey | null {
  for (const s of PASTE_SECTIONS) {
    if (s.re.test(line) && line.replace(s.re, '').replace(/[:.\s]/g, '').length === 0) return s.key
  }
  return null
}

/**
 * Parse a stat block from pasted text (D&D Beyond, a book typed out, Open5e, or
 * homebrew). Tolerant and best-effort: it fills what it recognizes — identity,
 * core stats, abilities, defenses, and the entry sections — and leaves the rest
 * for the DM. A "Spellcasting" trait/action routes to the spellcasting section.
 * Returns a mostly-empty block when the text has nothing recognizable.
 */
export function parseStatBlockText(text: string): StatBlock {
  const block = emptyStatBlock()
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  if (lines.length === 0) return block

  // Identity: "Medium humanoid (any race), any alignment".
  for (const line of lines) {
    const m = line.match(SIZE_RE)
    if (!m) continue
    block.size = capitalize(m[1].toLowerCase())
    let rest = m[2].trim()
    const comma = rest.lastIndexOf(',')
    if (comma !== -1) { block.alignment = rest.slice(comma + 1).trim(); rest = rest.slice(0, comma).trim() }
    block.creatureType = rest
    break
  }

  // Labeled single-line fields (first match wins, so header beats entry text).
  let damageImm = ''
  let conditionImm = ''
  for (const line of lines) {
    let v: string | null
    if ((v = fieldValue(line, ['Armor Class', 'AC'])) != null) {
      // 2024 layout puts AC and Initiative on one line: "AC 17 Initiative +5 (15)".
      const combined = v.match(/^(.*?)\s*initiative\b[:\s]*(.+)$/i)
      if (combined) {
        if (!block.ac) block.ac = combined[1].trim()
        if (!block.initiative) block.initiative = combined[2].trim()
      } else if (!block.ac) block.ac = v
    }
    else if ((v = fieldValue(line, ['Hit Points', 'HP'])) != null) { if (!block.hp) block.hp = v }
    else if ((v = fieldValue(line, ['Initiative'])) != null) { if (!block.initiative) block.initiative = v }
    else if ((v = fieldValue(line, ['Speed'])) != null) { if (!block.speed) block.speed = v }
    else if ((v = fieldValue(line, ['Saving Throws', 'Saves'])) != null) { if (!block.saveProficiencies.length) block.saveProficiencies = parseSaveProficiencies(v) }
    else if ((v = fieldValue(line, ['Skills'])) != null) { if (!block.skills) block.skills = v }
    else if ((v = fieldValue(line, ['Damage Vulnerabilities', 'Vulnerabilities'])) != null) { if (!block.vulnerabilities) block.vulnerabilities = v }
    else if ((v = fieldValue(line, ['Damage Resistances', 'Resistances'])) != null) { if (!block.resistances) block.resistances = v }
    else if ((v = fieldValue(line, ['Damage Immunities'])) != null) { if (!damageImm) damageImm = v }
    else if ((v = fieldValue(line, ['Condition Immunities'])) != null) { if (!conditionImm) conditionImm = v }
    else if ((v = fieldValue(line, ['Immunities'])) != null) { if (!damageImm) damageImm = v }
    else if ((v = fieldValue(line, ['Senses'])) != null) { if (!block.senses) block.senses = v }
    else if ((v = fieldValue(line, ['Languages'])) != null) { if (!block.languages) block.languages = v }
    else if ((v = fieldValue(line, ['Gear'])) != null) { if (!block.gear) block.gear = v }
    else if ((v = fieldValue(line, ['Habitat'])) != null) { if (!block.habitat) block.habitat = v }
    else if ((v = fieldValue(line, ['Treasure'])) != null) { if (!block.treasure) block.treasure = v }
    else if ((v = fieldValue(line, ['Challenge', 'CR'])) != null) { if (!block.cr) block.cr = extractCr(v) }
    else if ((v = fieldValue(line, ['Proficiency Bonus', 'PB'])) != null) { if (!block.pb) block.pb = v.replace(/^\+/, '').trim() }
  }
  block.immunities = [damageImm, conditionImm].filter((s) => s.trim()).join('; ')

  parseAbilities(lines, block)

  // Entry sections. A line that's a section header switches the current section;
  // "Name. text" starts an entry, other lines continue the open one. Before any
  // header, the first un-labeled lines after the stat fields are traits (the
  // 2014 layout has no "Traits" heading).
  const entries: Record<EntrySectionKey, StatBlockEntry[]> = {
    traits: [], actions: [], spellcasting: [], bonusActions: [], reactions: [], legendaryActions: [],
  }
  let current: EntrySectionKey | null = null
  let open: StatBlockEntry | null = null
  let sawField = false

  for (const line of lines) {
    const header = sectionFor(line)
    if (header) { current = header; open = null; continue }

    const isHeaderLine = PASTE_FIELD.test(line) || SIZE_RE.test(line) ||
      (ABILITY_HEADER_RE.test(line) && !/[.]/.test(line)) || ABILITY_VALUE_RE.test(line) ||
      ABILITY_WORD.str.test(line) || ABILITY_WORD.dex.test(line) || ABILITY_WORD.con.test(line) ||
      ABILITY_WORD.int.test(line) || ABILITY_WORD.wis.test(line) || ABILITY_WORD.cha.test(line)

    if (current === null) {
      if (!sawField) { if (isHeaderLine) sawField = true; continue }
      // Past the stat fields now. Only a named entry ("Name. …") opens the
      // un-headed traits section (2014/2024 layouts). Stray stat-table lines —
      // the 2024 "MOD / SAVE" ability grid, Gear, etc. — are skipped, not
      // swallowed as a trait.
      if (isHeaderLine || !ENTRY_NAME_RE.test(line)) continue
      current = 'traits'
    }

    const named = line.match(/^([A-Z][^.]{0,58}?)\.\s+(\S.*)$/)
    const nameOnly = line.match(/^([A-Z][A-Za-z0-9 ,'’()\-/+]{0,58}?)\.\s*$/)
    if (named) {
      open = { id: crypto.randomUUID(), name: named[1].trim(), text: named[2].trim() }
      entries[current].push(open)
    } else if (nameOnly) {
      open = { id: crypto.randomUUID(), name: nameOnly[1].trim(), text: '' }
      entries[current].push(open)
    } else if (open) {
      open.text = open.text ? `${open.text} ${line}` : line
    } else {
      open = { id: crypto.randomUUID(), name: '', text: line }
      entries[current].push(open)
    }
  }

  // Spells are actions: route a Spellcasting trait/action to the spells section.
  const isSpellcasting = (e: StatBlockEntry) => /spellcasting/i.test(e.name)
  entries.spellcasting.push(...entries.traits.filter(isSpellcasting), ...entries.actions.filter(isSpellcasting))
  entries.traits = entries.traits.filter((e) => !isSpellcasting(e))
  entries.actions = entries.actions.filter((e) => !isSpellcasting(e))

  block.traits = entries.traits
  block.actions = entries.actions
  block.spellcasting = entries.spellcasting
  block.bonusActions = entries.bonusActions
  block.reactions = entries.reactions
  block.legendaryActions = entries.legendaryActions
  return block
}

/** Whether a parsed block found anything worth importing (vs. empty text). */
export function statBlockHasContent(block: StatBlock): boolean {
  if (block.size || block.creatureType || block.ac || block.hp || block.speed || block.cr) return true
  if (block.traits.length || block.actions.length || (block.spellcasting?.length ?? 0) ||
    block.bonusActions.length || block.reactions.length || block.legendaryActions.length) return true
  return ABILITY_KEYS.some((k) => block.abilities[k] !== 10)
}