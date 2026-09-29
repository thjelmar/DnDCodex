// D&D Beyond character import (v1, read-only, experimental).
//
// The browser can't fetch DDB directly (CORS), so `fetchDdbCharacter` calls our
// Pages Function (functions/api/ddb-character.ts), which returns a trimmed copy
// of DDB's character JSON. `mapDdbCharacter` turns that into our CharacterSheet.
//
// IMPORTANT: DDB stores INPUTS, not computed values. We resolve the reliable
// pieces (identity, class/level, ability scores incl. item "set" overrides +
// fixed racial/feat bonuses, HP, speeds, senses, save/skill proficiencies,
// currency) and leave the rest — notably AC and any choose-your-ability bumps —
// unresolved (null / "verify"). A full modifier engine is v2.

import type {
  AbilityKey, CharacterAttack, CharacterClass, CharacterFeature, CharacterSheet, CharacterSpell, SpellSlot,
} from '../db/types'
import { abilityMod } from './statblock'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any

const STAT_ID: [number, AbilityKey][] = [
  [1, 'str'], [2, 'dex'], [3, 'con'], [4, 'int'], [5, 'wis'], [6, 'cha'],
]
const ABILITY_FULL: Record<AbilityKey, string> = {
  str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma',
}
const ALIGNMENTS: Record<number, string> = {
  1: 'Lawful Good', 2: 'Neutral Good', 3: 'Chaotic Good',
  4: 'Lawful Neutral', 5: 'True Neutral', 6: 'Chaotic Neutral',
  7: 'Lawful Evil', 8: 'Neutral Evil', 9: 'Chaotic Evil',
}
const SKILL_SLUGS = new Set([
  'acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history',
  'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
  'performance', 'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival',
])

interface Mod { type: string; subType: string; value: number | null; friendlySubtypeName?: string; componentId?: number }

function allMods(raw: Raw): Mod[] {
  const m = raw?.modifiers || {}
  return (Object.values(m) as Mod[][]).flat()
}

function statValue(arr: Raw, id: number): number | null {
  const row = (arr || []).find((s: Raw) => s?.id === id)
  return row && typeof row.value === 'number' ? row.value : null
}

/** Extract a numeric character id from a DDB URL or a bare id string. */
export function parseDdbId(input: string): string | null {
  const s = (input || '').trim()
  if (/^\d{1,15}$/.test(s)) return s
  const m = /dndbeyond\.com\/characters\/(\d{1,15})/.exec(s)
  return m ? m[1] : null
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Plain text (with newlines) → paragraph HTML for the rich-text body. */
function textToHtml(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Build a rich-text backstory/notes body from a DDB character's freeform
 *  fields (backstory + appearance + allies/enemies/possessions/etc.). Returns
 *  '' when the character has no freeform notes. */
export function extractBackstoryHtml(raw: Raw): string {
  const n = raw?.notes || {}
  const cap = (s: unknown) => (typeof s === 'string' ? s.slice(0, 12000).trim() : '')
  const sections: [string, string][] = [
    ['', cap(n.backstory)],
    ['Appearance', cap(raw?.traits?.appearance)],
    ['Allies', cap(n.allies)],
    ['Organizations', cap(n.organizations)],
    ['Enemies', cap(n.enemies)],
    ['Personal Possessions', cap(n.personalPossessions)],
    ['Other Holdings', cap(n.otherHoldings)],
    ['Other Notes', cap(n.otherNotes)],
  ]
  return sections
    .filter(([, body]) => body)
    .map(([heading, body]) => (heading ? `<h3>${heading}</h3>` : '') + textToHtml(body))
    .join('')
}

/** Fetch + trim via our Pages Function. Throws a friendly Error on failure. */
export async function fetchDdbCharacter(id: string): Promise<Raw> {
  const res = await fetch(`/api/ddb-character?id=${encodeURIComponent(id)}`)
  let body: Raw
  try {
    body = await res.json()
  } catch {
    throw new Error('D&D Beyond returned an unexpected response.')
  }
  if (!res.ok || !body?.ok) throw new Error(body?.error || `Import failed (${res.status}).`)
  return body.character
}

/** Final score for one ability: an ACTIVE item "set" (equipped/attuned; highest
 *  wins) overrides everything; otherwise base + manual bonus + fixed racial/feat
 *  "…-score" bonuses. The ambiguous "choose-an-ability-score" bumps aren't placed
 *  (needs choice data). `activeIds` gates item sets to gear that's actually on. */
function finalAbility(raw: Raw, mods: Mod[], key: AbilityKey, id: number, activeIds: Set<number>): number {
  const full = ABILITY_FULL[key]
  const sets = mods.filter(
    (m) => m.type === 'set' && m.subType === `${full}-score` && typeof m.value === 'number' &&
      (m.componentId == null || activeIds.has(m.componentId)),
  )
  if (sets.length) return Math.max(...sets.map((m) => m.value as number))

  const override = statValue(raw.overrideStats, id)
  if (override != null) return override

  const base = statValue(raw.stats, id) ?? 10
  const bonus = statValue(raw.bonusStats, id) ?? 0
  const modBonus = mods
    .filter((m) => m.type === 'bonus' && m.subType === `${full}-score` && typeof m.value === 'number')
    .reduce((s, m) => s + (m.value as number), 0)
  return base + bonus + modBonus
}

/** Strip HTML tags and DDB `{{template}}` markup; collapse whitespace; cap length. */
function cleanText(s: unknown, cap = 240): string {
  if (typeof s !== 'string') return ''
  const t = s
    .replace(/\{\{[^}]*\}\}/g, '') // DDB scaling templates like {{scalevalue}}
    .replace(/<[^>]+>/g, ' ') // HTML tags
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > cap ? t.slice(0, cap - 1).trimEnd() + '…' : t
}

// Boilerplate feature/trait names that duplicate other sheet sections — hidden.
const FEATURE_SKIP = new Set([
  'ability score increase', 'ability score improvement', 'languages', 'age', 'size', 'speed',
  'proficiencies', 'hit points', 'equipment', 'alignment', 'ability scores', 'feat',
])

/** Racial traits + class/subclass features → a flat, deduped, filtered list.
 *  DDB lists the FULL class progression in classFeatures, so gate each feature
 *  on `requiredLevel` vs the level actually attained (class level for class
 *  features, total level for racial traits). */
function buildFeatures(raw: Raw, totalLevel: number): CharacterFeature[] {
  const out: CharacterFeature[] = []
  const seen = new Set<string>()
  const add = (def: Raw, source: string, attained: number) => {
    const name = def?.name
    if (!name || def?.hideInSheet) return
    const req = typeof def.requiredLevel === 'number' ? def.requiredLevel : 1
    if (req > attained) return
    const key = name.toLowerCase()
    if (FEATURE_SKIP.has(key) || seen.has(key)) return
    seen.add(key)
    out.push({
      name,
      snippet: cleanText(def.snippet) || undefined,
      source,
      level: req > 1 ? req : undefined,
    })
  }

  const speciesName = raw.race?.subRaceShortName || raw.race?.baseName || raw.race?.fullName || 'Species'
  for (const t of (raw.race?.racialTraits || []) as Raw[]) add(t?.definition, speciesName, totalLevel)
  for (const c of (raw.classes || []) as Raw[]) {
    const cname = c?.definition?.name || 'Class'
    const sub = c?.subclassDefinition?.name
    const clvl = c?.level ?? totalLevel
    for (const f of (c?.classFeatures || []) as Raw[]) {
      add(f?.definition, f?.definition?.isSubClassFeature && sub ? sub : cname, clvl)
    }
  }
  return out
}

const DAMAGE_TYPE_BY_ID: Record<number, string> = {
  1: 'Bludgeoning', 2: 'Piercing', 3: 'Slashing', 4: 'Necrotic', 5: 'Acid', 6: 'Cold',
  7: 'Fire', 8: 'Lightning', 9: 'Thunder', 10: 'Poison', 11: 'Psychic', 12: 'Radiant', 13: 'Force',
}

/** Equipped weapons (with computed to-hit/damage) + special attack actions. */
function buildAttacks(
  raw: Raw, abilities: Record<AbilityKey, number>, profBonus: number, mods: Mod[],
): CharacterAttack[] {
  const out: CharacterAttack[] = []
  const strMod = abilityMod(abilities.str)
  const dexMod = abilityMod(abilities.dex)

  // Weapon proficiency: category (simple/martial) or a specific weapon slug.
  const profSubs = new Set(
    mods.filter((m) => m.type === 'proficiency').map((m) => (m.subType || '').toLowerCase()),
  )
  const isProficient = (categoryId: number, weaponType: string): boolean => {
    if (categoryId === 1 && profSubs.has('simple-weapons')) return true
    if (categoryId === 2 && profSubs.has('martial-weapons')) return true
    return profSubs.has((weaponType || '').toLowerCase())
  }

  const weapons = (raw.inventory || []).filter((it: Raw) => it?.weapon)
  const equipped = weapons.filter((it: Raw) => it.equipped)
  for (const it of (equipped.length ? equipped : weapons) as Raw[]) {
    const w = it.weapon
    const props: string[] = w.properties || []
    const finesse = props.includes('Finesse')
    const thrown = props.includes('Thrown')
    const ranged = w.attackType === 2
    // Ability: ranged → DEX; finesse → better of STR/DEX; else STR.
    const abMod = ranged ? dexMod : finesse ? Math.max(strMod, dexMod) : strMod

    let magicHit = 0, magicDmg = 0
    for (const gm of (w.grantedModifiers || []) as Raw[]) {
      if (gm.subType === 'magic' && typeof gm.value === 'number') { magicHit += gm.value; magicDmg += gm.value }
      else if (gm.subType === 'damage' && typeof gm.value === 'number') magicDmg += gm.value
    }
    const prof = isProficient(w.categoryId, w.weaponType)
    const toHit = abMod + (prof ? profBonus : 0) + magicHit

    const dmgMod = abMod + magicDmg
    const dmgType = (w.damageType || '').toLowerCase()
    const dice = w.damage || (w.fixedDamage != null ? String(w.fixedDamage) : '')
    const modStr = dmgMod === 0 ? '' : dmgMod > 0 ? ` + ${dmgMod}` : ` − ${Math.abs(dmgMod)}`
    const damage = dice ? `${dice}${modStr}${dmgType ? ' ' + dmgType : ''}` : undefined

    let range: string
    if (thrown) range = `Thrown (${w.range ?? 20}/${w.longRange ?? 60})`
    else if (ranged) range = `Ranged (${w.range ?? 0}/${w.longRange ?? 0})`
    else range = `Melee (${w.range ?? 5} ft.)`

    const notes = props.filter((p) => p !== 'Thrown')
    if (!prof) notes.push('not proficient')
    out.push({
      name: it.name, range, toHit, damage,
      note: notes.length ? notes.join(', ') : undefined,
    })
  }

  // Special attack actions DDB already computed a to-hit/damage for.
  for (const a of (raw.actionAttacks || []) as Raw[]) {
    if (!a?.dice) continue
    const hasToHit = a.fixedToHit != null || a.abilityModifierStatId != null
    if (!hasToHit) continue
    let toHit: number | null = null
    if (a.fixedToHit != null) toHit = a.fixedToHit
    else if (a.abilityModifierStatId != null) {
      const key = STAT_ID.find(([id]) => id === a.abilityModifierStatId)?.[1]
      if (key) toHit = abilityMod(abilities[key]) + profBonus
    }
    const dt = a.damageTypeId != null ? DAMAGE_TYPE_BY_ID[a.damageTypeId] : ''
    out.push({
      name: a.name,
      toHit,
      damage: `${a.dice}${dt ? ' ' + dt.toLowerCase() : ''}`,
      note: 'special',
    })
  }
  return out
}

/** Slimmed spell list → deduped, sorted; plus save DC / attack bonus. */
function buildSpells(
  raw: Raw, abilities: Record<AbilityKey, number>, profBonus: number,
): Pick<CharacterSheet, 'spells' | 'spellcasting' | 'spellSlots' | 'pactMagic'> {
  const rawSpells = (raw.spells || []) as Raw[]
  const byName = new Map<string, CharacterSpell>()
  for (const s of rawSpells) {
    if (!s?.name) continue
    const key = s.name.toLowerCase()
    const existing = byName.get(key)
    if (existing) {
      if (s.prepared) existing.prepared = true // prefer prepared across duplicate grants
      continue
    }
    byName.set(key, {
      name: s.name,
      level: typeof s.level === 'number' ? s.level : 0,
      school: s.school || undefined,
      prepared: !!s.prepared,
      concentration: !!s.concentration,
      ritual: !!s.ritual,
      source: s.source || undefined,
    })
  }
  const spells = Array.from(byName.values()).sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name),
  )

  const slot = (arr: Raw): SpellSlot[] =>
    Array.isArray(arr) ? arr.map((x: Raw) => ({ level: x.level, total: x.total })).filter((x) => x.total > 0) : []
  const spellSlots = slot(raw.spellSlots)
  const pactMagic = slot(raw.pactMagic)

  let spellcasting: CharacterSheet['spellcasting']
  const castId = raw.spellcastingAbilityId
  if (typeof castId === 'number') {
    const key = STAT_ID.find(([id]) => id === castId)?.[1]
    if (key) {
      const m = abilityMod(abilities[key])
      spellcasting = { ability: key, saveDc: 8 + profBonus + m, attackBonus: profBonus + m }
    }
  }

  return {
    spells: spells.length ? spells : undefined,
    spellcasting,
    spellSlots: spellSlots.length ? spellSlots : undefined,
    pactMagic: pactMagic.length ? pactMagic : undefined,
  }
}

export function mapDdbCharacter(raw: Raw): CharacterSheet {
  const mods = allMods(raw)

  // Which item ids are "active" (equipped, and attuned if the item needs it) —
  // used to decide whether an ability-setting item (Belt/Gauntlets/Amulet) counts.
  const activeIds = new Set<number>()
  for (const it of (raw.inventory || []) as Raw[]) {
    if (it?.equipped && (it.isAttuned || !it.canAttune)) {
      if (typeof it.id === 'number') activeIds.add(it.id)
      if (typeof it.defId === 'number') activeIds.add(it.defId)
    }
  }

  const abilities = {} as Record<AbilityKey, number>
  for (const [id, key] of STAT_ID) abilities[key] = finalAbility(raw, mods, key, id, activeIds)

  const classes: CharacterClass[] = (raw.classes || []).map((c: Raw) => ({
    name: c?.definition?.name ?? 'Class',
    level: c?.level ?? 0,
    subclass: c?.subclassDefinition?.name || undefined,
  }))
  const level = classes.reduce((s, c) => s + (c.level || 0), 0) || 1
  const proficiencyBonus = 2 + Math.floor((level - 1) / 4)

  const saveProficiencies: AbilityKey[] = []
  for (const [, key] of STAT_ID) {
    if (mods.some((m) => m.type === 'proficiency' && m.subType === `${ABILITY_FULL[key]}-saving-throws`)) {
      saveProficiencies.push(key)
    }
  }

  const skillProficiencies = Array.from(
    new Set(
      mods
        .filter((m) => m.type === 'proficiency' && SKILL_SLUGS.has(m.subType))
        .map((m) => m.friendlySubtypeName || m.subType),
    ),
  )

  const dark = mods.find((m) => m.type === 'set-base' && (m.subType || '').includes('darkvision'))
  const senses = dark && typeof dark.value === 'number' ? `Darkvision ${dark.value} ft.` : undefined

  // HP: baseHitPoints (hit dice, no CON) + CON mod × level + per-level bonuses
  // (Dwarven Toughness, Tough) + flat bonuses. An override wins outright.
  const conMod = abilityMod(abilities.con)
  const perLevelHp = mods
    .filter((m) => m.subType === 'hit-points-per-level' && typeof m.value === 'number')
    .reduce((s, m) => s + (m.value as number), 0)
  const flatHp = (raw.bonusHitPoints || 0) +
    mods.filter((m) => m.type === 'bonus' && m.subType === 'hit-points' && typeof m.value === 'number')
      .reduce((s, m) => s + (m.value as number), 0)
  const maxHp = typeof raw.overrideHitPoints === 'number'
    ? raw.overrideHitPoints
    : (raw.baseHitPoints ?? 0) + conMod * level + perLevelHp * level + flatHp
  const currentHp = Math.max(0, maxHp - (raw.removedHitPoints || 0))

  // Speed: DDB gives the final walk as a `set speed-walking` modifier when items/
  // class features change it (e.g. Barbarian Fast Movement); otherwise race base
  // plus any `bonus speed`. Other movement types fall back to the racial base.
  const sp = raw.race?.weightSpeeds?.normal || {}
  const walkSet = mods.find((m) => m.type === 'set' && m.subType === 'speed-walking' && typeof m.value === 'number')
  const walkBonus = mods
    .filter((m) => m.type === 'bonus' && m.subType === 'speed' && typeof m.value === 'number')
    .reduce((s, m) => s + (m.value as number), 0)
  const speeds = {
    walk: (walkSet ? (walkSet.value as number) : (sp.walk || 0) + walkBonus) || undefined,
    fly: sp.fly || undefined, swim: sp.swim || undefined, climb: sp.climb || undefined, burrow: sp.burrow || undefined,
  }

  const c = raw.currencies || {}
  const currency = { pp: c.pp || 0, gp: c.gp || 0, ep: c.ep || 0, sp: c.sp || 0, cp: c.cp || 0 }

  // ── Tier 1 sections ──────────────────────────────────────────────────────
  const uniq = (a: (string | undefined)[]) => Array.from(new Set(a.filter((x): x is string => !!x)))
  const nameOf = (m: Mod) => m.friendlySubtypeName || m.subType

  const languages = uniq(mods.filter((m) => m.type === 'language').map(nameOf))
  const resistances = uniq(mods.filter((m) => m.type === 'resistance').map(nameOf))
  const immunities = uniq(mods.filter((m) => m.type === 'immunity').map(nameOf))

  const TOOL_HINTS = ['supplies', 'tools', 'kit', 'instrument', 'utensil', 'gaming-set', 'vehicles', 'thieves']
  const armorP: string[] = [], weaponP: string[] = [], toolP: string[] = []
  for (const m of mods) {
    if (m.type !== 'proficiency') continue
    const sub = m.subType || ''
    if (SKILL_SLUGS.has(sub) || sub.endsWith('-saving-throws') || sub.startsWith('choose-')) continue
    const label = nameOf(m)
    if (sub === 'shields' || sub.endsWith('-armor')) armorP.push(label)
    else if (TOOL_HINTS.some((h) => sub.includes(h))) toolP.push(label)
    else weaponP.push(label)
  }
  const proficiencies = { armor: uniq(armorP), weapons: uniq(weaponP), tools: uniq(toolP) }

  const feats = uniq((raw.feats || []).map((f: Raw) => f?.definition?.name))
  const backgroundFeature = raw.background?.definition?.featureName || undefined
  const t = raw.traits || {}
  const personality = (t.personalityTraits || t.ideals || t.bonds || t.flaws)
    ? { traits: t.personalityTraits || undefined, ideals: t.ideals || undefined, bonds: t.bonds || undefined, flaws: t.flaws || undefined }
    : undefined
  const inventory = (raw.inventory || []).map((it: Raw) => ({
    name: it.name || 'Item', qty: it.qty ?? 1, equipped: !!it.equipped, attuned: !!it.isAttuned,
    rarity: it.rarity || undefined, type: it.type || undefined,
  }))

  // ── Tier 2 sections ──────────────────────────────────────────────────────
  const features = buildFeatures(raw, level)
  const attacks = buildAttacks(raw, abilities, proficiencyBonus, mods)
  const { spells, spellcasting, spellSlots, pactMagic } = buildSpells(raw, abilities, proficiencyBonus)

  return {
    species: raw.race?.fullName || raw.race?.baseRaceName || '',
    classes,
    background: raw.background?.definition?.name || raw.background?.customBackground?.name || '',
    alignment: ALIGNMENTS[raw.alignmentId as number] || '',
    level,
    xp: raw.currentXp || undefined,
    abilities,
    saveProficiencies,
    skillProficiencies,
    proficiencyBonus,
    ac: null,
    maxHp,
    currentHp,
    tempHp: raw.temporaryHitPoints || 0,
    speeds,
    senses,
    currency,
    languages,
    proficiencies,
    resistances,
    immunities,
    feats,
    backgroundFeature,
    personality,
    inventory,
    features: features.length ? features : undefined,
    attacks: attacks.length ? attacks : undefined,
    spells,
    spellcasting,
    spellSlots,
    pactMagic,
    imageId: null,
    avatarUrl: raw.decorations?.avatarUrl || undefined,
    ddb: {
      characterId: raw.id,
      url: `https://www.dndbeyond.com/characters/${raw.id}`,
      lastImportedAt: new Date().toISOString(),
    },
  }
}
