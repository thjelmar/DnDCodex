import { test, expect } from '@playwright/test'
import { templateGeom } from '../src/lib/tabletop'
import { COMMON_SPELLS, TEMPLATE_PRESETS, matchSpells, spellsMentioned } from '../src/data/templatePresets'
import type { SceneGrid, SceneTemplate } from '../src/db/types'

// Template presets (T-103): the cube shape, line width and the preset and spell lists. Pure logic.

const grid: SceneGrid = { cellPx: 50, offsetX: 0, offsetY: 0, show: true, color: '#fff' }
const tpl = (extra: Partial<SceneTemplate>): SceneTemplate => ({ id: 't', shape: 'cube', col: 2, row: 2, sizeFt: 10, dir: 0, color: '#f00', ...extra })

test.describe('template presets', () => {
  test('a cube is a square of sizeFt per side, aimed from the origin', () => {
    const g = templateGeom(grid, tpl({ shape: 'cube', sizeFt: 10 }))
    expect(g.kind).toBe('poly')
    if (g.kind !== 'poly') return
    const xs = g.points.map((p) => p[0])
    const ys = g.points.map((p) => p[1])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100) // 10 ft = 2 squares = 100 px
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(100)
  })

  test('a line is 5 ft wide unless widthFt says otherwise', () => {
    const width = (extra: Partial<SceneTemplate>) => {
      const g = templateGeom(grid, tpl({ shape: 'line', sizeFt: 30, ...extra }))
      if (g.kind !== 'poly') throw new Error('expected a polygon')
      const ys = g.points.map((p) => p[1])
      return Math.max(...ys) - Math.min(...ys)
    }
    expect(width({})).toBeCloseTo(50)
    expect(width({ widthFt: 10 })).toBeCloseTo(100)
  })

  test('presets and spells cover the agreed shapes', () => {
    expect(TEMPLATE_PRESETS.map((p) => p.label)).toEqual([
      'Cone 15 ft', 'Cone 30 ft', 'Sphere 10 ft', 'Sphere 20 ft', 'Sphere 30 ft', 'Line 30 × 5 ft', 'Cube 10 ft',
    ])
    const fireball = COMMON_SPELLS.find((s) => s.name === 'Fireball')
    expect(fireball).toMatchObject({ shape: 'circle', sizeFt: 20 })
  })

  test('suggestions: prefix first, and stat block text finds known spells', () => {
    expect(matchSpells('th').map((s) => s.name)[0]).toBe('Thunderwave')
    expect(matchSpells('')).toHaveLength(COMMON_SPELLS.length)
    expect(spellsMentioned('At will: web. 3/day each: fireball, lightning bolt').map((s) => s.name).sort()).toEqual(['Fireball', 'Lightning Bolt', 'Web'])
    expect(spellsMentioned('no spells here')).toEqual([])
  })
})
