import type { NPC, Location, Note, Session, Item, StatBlock, StatBlockSectionSpoilers } from '../db/types'
import { emptyStatBlock } from './statblock'

// Builds the reveal-safe, structured snapshot pushed to players for a shared
// entity. It splits the entity into sections (overview fields, rich-text bodies,
// stat block) and strips every spoiler: inline rich-text spoiler spans are
// removed entirely, and spoilered stat-block rows/entries are dropped — so the
// hidden data never reaches a player's browser (true redaction, not blurring).
// DM-only fields (session DM notes) are never included.

export type ShareableKind = 'npc' | 'location' | 'note' | 'session' | 'item'

type Shareable = NPC | Location | Note | Session | Item

/** The sections each kind can expose to players, in display order. Keys match
 *  the section keys produced by `revealEntity`. Drives the share section picker
 *  and the header push panel's per-section breakdown. */
export const SECTIONS: Record<ShareableKind, { key: string; label: string }[]> = {
  npc: [
    { key: 'overview', label: 'Overview' },
    { key: 'description', label: 'Description' },
    { key: 'statblock', label: 'Stat block' },
    { key: 'notes', label: 'Notes' },
  ],
  location: [
    { key: 'overview', label: 'Overview' },
    { key: 'description', label: 'Description' },
    { key: 'poi', label: 'Points of interest' },
  ],
  item: [
    { key: 'overview', label: 'Overview' },
    { key: 'description', label: 'Description' },
  ],
  session: [{ key: 'recap', label: 'Recap' }],
  note: [{ key: 'body', label: 'Note' }],
}

export interface RevealedField {
  label: string
  value: string
}

/** A redacted stat block for players: spoilered rows are blanked and spoilered
 *  entries removed; `hideAbilities` tells the renderer to omit the ability grid
 *  (its scores are dummied out here so nothing real is sent). */
export interface RevealedStatBlock {
  block: StatBlock
  hideAbilities: boolean
  /** Which fixed rows were redacted — the player renderer shows a marker. */
  hidden: StatBlockSectionSpoilers
}

export interface RevealedSection {
  key: string
  label: string
  /** Rich-text HTML (spoilers already redacted) — for prose sections. */
  html?: string
  /** Key/value fields — for the overview section. */
  fields?: RevealedField[]
  /** A redacted stat block — for the stat-block section. */
  statBlock?: RevealedStatBlock
}

export interface RevealedEntity {
  kind: ShareableKind
  title: string
  subtitle?: string
  sections: RevealedSection[]
}

/** Replace every spoiler-marked span with a redaction placeholder, dropping the
 *  hidden text. Runs on the DM's client at push time. */
export function redactSpoilers(html: string): string {
  if (!html || html.indexOf('data-spoiler') === -1) return html
  if (typeof DOMParser === 'undefined') {
    return html.replace(
      /<span[^>]*data-spoiler[^>]*>[\s\S]*?<\/span>/gi,
      '<span class="spoiler-hidden">Hidden by your DM</span>',
    )
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('[data-spoiler]').forEach((el) => {
    const ph = doc.createElement('span')
    ph.className = 'spoiler-hidden'
    ph.textContent = 'Hidden by your DM'
    el.replaceWith(ph)
  })
  return doc.body.innerHTML
}

/** Whether an HTML body has anything worth showing after redaction. */
function hasVisible(html: string): boolean {
  if (!html) return false
  if (html.includes('spoiler-hidden') || html.includes('<img')) return true
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
}

function htmlSection(key: string, label: string, raw: string): RevealedSection | null {
  const html = redactSpoilers(raw || '')
  return hasVisible(html) ? { key, label, html } : null
}

function fieldsSection(key: string, label: string, fields: RevealedField[]): RevealedSection | null {
  const kept = fields.filter((f) => f.value && f.value.trim() && f.value !== 'unknown')
  return kept.length ? { key, label, fields: kept } : null
}

/** Produce a player-safe copy of a stat block: blank spoilered rows, drop
 *  spoilered entries, and dummy out the abilities when they're hidden. */
function revealStatBlock(sb: StatBlock): RevealedStatBlock {
  const s = sb.sectionSpoilers ?? {}
  // Spoilered entries stay in place as redacted markers (no name/text sent), so
  // the player sees "hidden" where an action/trait was rather than nothing.
  const keep = (arr: StatBlock['traits']) =>
    arr.map((e) => (e.spoiler ? { id: e.id, name: '', text: '', hidden: true } : { id: e.id, name: e.name, text: e.text }))
  const block: StatBlock = {
    ...sb,
    ac: s.core ? '' : sb.ac,
    hp: s.core ? '' : sb.hp,
    speed: s.core ? '' : sb.speed,
    initiative: s.core ? '' : sb.initiative,
    skills: s.secondary ? '' : sb.skills,
    resistances: s.secondary ? '' : sb.resistances,
    immunities: s.secondary ? '' : sb.immunities,
    vulnerabilities: s.secondary ? '' : sb.vulnerabilities,
    senses: s.secondary ? '' : sb.senses,
    languages: s.secondary ? '' : sb.languages,
    cr: s.cr ? '' : sb.cr,
    pb: s.cr ? '' : sb.pb,
    habitat: s.gear ? '' : sb.habitat,
    gear: s.gear ? '' : sb.gear,
    treasure: s.gear ? '' : sb.treasure,
    abilities: s.abilities ? emptyStatBlock().abilities : sb.abilities,
    saveProficiencies: s.abilities ? [] : sb.saveProficiencies,
    traits: keep(sb.traits),
    actions: keep(sb.actions),
    bonusActions: keep(sb.bonusActions),
    reactions: keep(sb.reactions),
    legendaryActions: keep(sb.legendaryActions),
    sectionSpoilers: undefined,
  }
  return {
    block,
    hideAbilities: !!s.abilities,
    hidden: { core: s.core, abilities: s.abilities, secondary: s.secondary, cr: s.cr, gear: s.gear },
  }
}

/** The reveal-safe, spoiler-redacted, structured snapshot for a shareable entity.
 *  When `only` is given, only those section keys are included — the DM's chosen
 *  subset from the share picker (undefined = every section). */
export function revealEntity(
  kind: ShareableKind,
  e: NPC | Location | Note | Session | Item,
  only?: string[],
): RevealedEntity {
  const r = buildReveal(kind, e)
  if (only) r.sections = r.sections.filter((s) => only.includes(s.key))
  return r
}

/** Reveal an entity using the section subset stored on it (its `sharedSections`). */
export function entityReveal(kind: ShareableKind, e: Shareable): RevealedEntity {
  return revealEntity(kind, e, e.sharedSections)
}

function buildReveal(
  kind: ShareableKind,
  e: NPC | Location | Note | Session | Item,
): RevealedEntity {
  switch (kind) {
    case 'npc': {
      const n = e as NPC
      const sections: RevealedSection[] = []
      const ov = fieldsSection('overview', 'Overview', [
        { label: 'Race', value: n.race },
        { label: 'Role', value: n.role },
        { label: 'Disposition', value: n.disposition },
      ])
      if (ov) sections.push(ov)
      const desc = htmlSection('description', 'Description', n.description)
      if (desc) sections.push(desc)
      if (n.statBlockData) sections.push({ key: 'statblock', label: 'Stat block', statBlock: revealStatBlock(n.statBlockData) })
      const notes = htmlSection('notes', 'Notes', n.statBlock)
      if (notes) sections.push(notes)
      return { kind, title: n.name, subtitle: n.role || undefined, sections }
    }
    case 'location': {
      const l = e as Location
      const sections: RevealedSection[] = []
      const ov = fieldsSection('overview', 'Overview', [
        { label: 'Type', value: l.type },
        { label: 'Government', value: l.governmentType },
        { label: 'Currency', value: l.currency },
        { label: 'Religion', value: l.religion },
        { label: 'Population', value: l.population },
        { label: 'Prosperity', value: l.prosperity },
        { label: 'Imports', value: l.imports },
        { label: 'Exports', value: l.exports },
      ])
      if (ov) sections.push(ov)
      const desc = htmlSection('description', 'Description', l.description)
      if (desc) sections.push(desc)
      const poi = htmlSection('poi', 'Points of interest', l.pointsOfInterest)
      if (poi) sections.push(poi)
      return { kind, title: l.name, subtitle: l.type, sections }
    }
    case 'item': {
      const i = e as Item
      const sections: RevealedSection[] = []
      const ov = fieldsSection('overview', 'Overview', [
        { label: 'Rarity', value: i.rarity },
        { label: 'Type', value: i.category },
        { label: 'Value', value: i.value },
        { label: 'Attunement', value: i.attunement ? 'Required' : '' },
      ])
      if (ov) sections.push(ov)
      const desc = htmlSection('description', 'Description', i.description)
      if (desc) sections.push(desc)
      return { kind, title: i.name, subtitle: i.rarity, sections }
    }
    case 'session': {
      const s = e as Session
      const sections: RevealedSection[] = []
      // Player-facing recap only — never the DM notes.
      const recap = htmlSection('recap', 'Recap', s.notes)
      if (recap) sections.push(recap)
      return { kind, title: s.title, subtitle: s.date || undefined, sections }
    }
    case 'note': {
      const n = e as Note
      const sections: RevealedSection[] = []
      const body = htmlSection('body', 'Note', n.body)
      if (body) sections.push(body)
      return { kind, title: n.title, sections }
    }
  }
}

/**
 * A stable hash of a reveal snapshot's content, to tell whether a shared entity
 * has unpushed changes. Content-based (whole structured snapshot), so editing
 * DM-only fields or writing share flags doesn't flag a pending change.
 */
export function revealHash(r: RevealedEntity): string {
  const s = JSON.stringify(r)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
