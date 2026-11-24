import type { TemplateShape } from '../db/types'

// Area-template presets (T-103). The app has no spell database, so spell names
// are optional labels: a short built-in list of common area spells arms the
// matching shape and size, and the DM can type any name.

export interface TemplatePreset {
  id: string
  label: string
  shape: TemplateShape
  /** Radius (circle) or length (cone, line, cube side), in feet. */
  sizeFt: number
  /** Line width in feet. */
  widthFt?: number
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  { id: 'cone-15', label: 'Cone 15 ft', shape: 'cone', sizeFt: 15 },
  { id: 'cone-30', label: 'Cone 30 ft', shape: 'cone', sizeFt: 30 },
  { id: 'sphere-10', label: 'Sphere 10 ft', shape: 'circle', sizeFt: 10 },
  { id: 'sphere-20', label: 'Sphere 20 ft', shape: 'circle', sizeFt: 20 },
  { id: 'sphere-30', label: 'Sphere 30 ft', shape: 'circle', sizeFt: 30 },
  { id: 'line-30', label: 'Line 30 × 5 ft', shape: 'line', sizeFt: 30, widthFt: 5 },
  { id: 'cube-10', label: 'Cube 10 ft', shape: 'cube', sizeFt: 10 },
]

export interface SpellArea {
  name: string
  shape: TemplateShape
  sizeFt: number
  widthFt?: number
}

/** Common area spells and the template each one draws. */
export const COMMON_SPELLS: SpellArea[] = [
  { name: 'Burning Hands', shape: 'cone', sizeFt: 15 },
  { name: 'Cone of Cold', shape: 'cone', sizeFt: 60 },
  { name: 'Thunderwave', shape: 'cube', sizeFt: 15 },
  { name: 'Fireball', shape: 'circle', sizeFt: 20 },
  { name: 'Lightning Bolt', shape: 'line', sizeFt: 100, widthFt: 5 },
  { name: 'Shatter', shape: 'circle', sizeFt: 10 },
  { name: 'Darkness', shape: 'circle', sizeFt: 15 },
  { name: 'Web', shape: 'cube', sizeFt: 20 },
]

/** Spells whose name appears in a block of text (a stat block's spellcasting entries). */
export function spellsMentioned(text: string): SpellArea[] {
  const lower = text.toLowerCase()
  return COMMON_SPELLS.filter((s) => lower.includes(s.name.toLowerCase()))
}

/** Suggestions for a name typed so far: names that start with it first, then names that contain it. */
export function matchSpells(query: string, list: SpellArea[] = COMMON_SPELLS): SpellArea[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  const starts = list.filter((s) => s.name.toLowerCase().startsWith(q))
  const has = list.filter((s) => !s.name.toLowerCase().startsWith(q) && s.name.toLowerCase().includes(q))
  return [...starts, ...has]
}
