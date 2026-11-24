import { test, expect } from '@playwright/test'
import { cleanTerrain, drawsZone, footprint, hasTerrain, terrainTags } from '../src/lib/terrain'
import type { SceneToken } from '../src/db/types'

// Terrain and cover markers (T-103): pure logic, no browser.

const tok = (extra: Partial<SceneToken> = {}): SceneToken => ({ id: 't', label: 'T', color: '#fff', col: 0, row: 0, size: 1, ...extra })

test.describe('terrain markers', () => {
  test('tags read in a fixed order', () => {
    expect(terrainTags({ blocks: true, cover: 'half', difficult: true })).toEqual(['Difficult', '½ cover', 'Blocks'])
    expect(terrainTags({ cover: 'three-quarters' })).toEqual(['¾ cover'])
    expect(terrainTags(undefined)).toEqual([])
  })

  test('an empty marker set is no marker, and cleanTerrain drops the key', () => {
    expect(hasTerrain({})).toBe(false)
    expect(cleanTerrain({ difficult: false, blocks: false })).toBeUndefined()
    expect(cleanTerrain({ difficult: true, cover: undefined })).toEqual({ difficult: true })
  })

  test('footprint falls back to size and stays within 1 to 12 cells', () => {
    expect(footprint({ size: 2 })).toEqual({ w: 2, h: 2 })
    expect(footprint({ size: 1, w: 6, h: 1 })).toEqual({ w: 6, h: 1 })
    expect(footprint({ size: 1, w: 40, h: 0 })).toEqual({ w: 12, h: 1 })
  })

  test('only a token with a marker or a footprint draws a zone, so old tokens render unchanged', () => {
    expect(drawsZone(tok())).toBe(false)
    expect(drawsZone(tok({ terrain: {} }))).toBe(false)
    expect(drawsZone(tok({ terrain: { difficult: true } }))).toBe(true)
    expect(drawsZone(tok({ w: 3 }))).toBe(true)
  })
})
