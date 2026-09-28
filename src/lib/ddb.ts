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

import type { AbilityKey, CharacterClass, CharacterSheet } from '../db/types'
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
    imageId: null,
    avatarUrl: raw.decorations?.avatarUrl || undefined,
    ddb: {
      characterId: raw.id,
      url: `https://www.dndbeyond.com/characters/${raw.id}`,
      lastImportedAt: new Date().toISOString(),
    },
  }
}
