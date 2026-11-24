import { test, expect } from '@playwright/test'
import { normalizeKind, resolveKind } from '../src/lib/tokenKind'
import { parseWalkFt, tokenCardData } from '../src/lib/tokenCard'
import type { NPC, SceneToken } from '../src/db/types'

// Token categories (T-103): older kind values read as the new names, and tokens with no
// kind are filed by their links. Pure logic, no browser.

const tok = (extra: Partial<SceneToken> = {}): SceneToken => ({ id: 't', label: 'T', color: '#fff', col: 0, row: 0, size: 1, ...extra })

test.describe('token kind', () => {
  test('older values read as the new names, and nothing is lost', () => {
    expect(normalizeKind('hero')).toBe('character')
    expect(normalizeKind('foe')).toBe('enemy')
    expect(normalizeKind('object')).toBe('prop')
    for (const k of ['character', 'npc', 'enemy', 'prop']) expect(normalizeKind(k)).toBe(k)
    expect(normalizeKind(undefined)).toBeUndefined()
    expect(normalizeKind('nonsense')).toBeUndefined()
  })

  test('a kind the DM set wins over inference', () => {
    expect(resolveKind(tok({ kind: 'prop', controlledBy: 'u1', npcId: 'n1' }))).toBe('prop')
    expect(resolveKind(tok({ kind: 'foe' }))).toBe('enemy')
  })

  test('inference: control or a PC makes a Character, friendly an NPC, links an Enemy, the rest a Prop', () => {
    expect(resolveKind(tok({ controlledBy: 'u1' }))).toBe('character')
    expect(resolveKind(tok(), { isPC: true })).toBe('character')
    expect(resolveKind(tok({ friendly: true, npcId: 'n1' }))).toBe('npc')
    expect(resolveKind(tok({ npcId: 'n1' }))).toBe('enemy')
    expect(resolveKind(tok(), { isPC: false })).toBe('enemy')
    expect(resolveKind(tok({ icon: '📦' }))).toBe('prop')
  })

  test('card: walking speed comes from the stat block text, and a manual speed wins', () => {
    expect(parseWalkFt('30 ft., fly 60 ft. (hover)')).toBe(30)
    expect(parseWalkFt('walk 40 ft.')).toBe(40)
    expect(parseWalkFt('fly 60 ft.')).toBeNull()
    expect(parseWalkFt('')).toBeNull()
    const npc = { id: 'n1', statBlockData: { ac: '15 (leather)', speed: '30 ft.', actions: [{ id: 'a', name: 'Scimitar', text: 'Melee. +5 to hit, 1d6+3 slashing. More text.' }] } } as unknown as NPC
    const card = tokenCardData(tok({ npcId: 'n1' }), undefined, npc)
    expect([card.ac, card.speedFt, card.speedFrom, card.attacks[0].text]).toEqual(['15', 30, 'stat block', 'Melee.'])
    expect(tokenCardData(tok({ npcId: 'n1', speedFt: 25 }), undefined, npc).speedFt).toBe(25)
    const bare = tokenCardData(tok(), undefined, undefined)
    expect([bare.hp, bare.ac, bare.speedFt, bare.attacks.length, bare.npcId]).toEqual([null, null, null, 0, null])
  })
})
