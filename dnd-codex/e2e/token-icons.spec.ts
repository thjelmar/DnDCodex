import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { pickTokenIcon, npcTokenIcon, TOKEN_ICON_RULES, TOKEN_ICON_CATALOG, isTokenIcon, TOKEN_ICON_AUTHORS } from '../src/lib/tokenIcons'

// Default token icons (T-64): the keyword map and the bundled set. Pure logic, no browser.

test.describe('token icon keyword map', () => {
  test('matches names, roles, races and creature types', () => {
    expect(pickTokenIcon({ name: 'Goblin 3' })).toBe('goblin-head')
    expect(pickTokenIcon({ name: 'Grukk', race: 'Half-Orc' })).toBe('orc-head')
    expect(pickTokenIcon({ name: 'Marta', role: 'Innkeeper', race: 'Human' })).toBe('beer-stein')
    expect(pickTokenIcon({ name: 'Brom', role: 'Blacksmith', race: 'Dwarf' })).toBe('anvil')
    expect(pickTokenIcon({ name: 'Ilyra', race: 'Elf' })).toBe('elf-ear')
    expect(pickTokenIcon({ name: 'Rotting thing', creatureType: 'Undead' })).toBe('skull-crossed-bones')
    expect(pickTokenIcon({ name: 'Smaug', creatureType: 'Dragon' })).toBe('dragon-head')
    expect(pickTokenIcon({ name: 'Hill Giant', creatureType: 'Giant' })).toBe('giant')
  })
  test('plurals and word boundaries', () => {
    expect(pickTokenIcon({ name: 'Wolves' })).toBe('wolf-head')
    expect(pickTokenIcon({ name: 'Swarm of Rats' })).toBe('rat')
    // "Bathsheba" contains "bat" but is not the word.
    expect(pickTokenIcon({ name: 'Bathsheba' })).toBeNull()
  })
  test('a specific name beats a generic creature type', () => {
    expect(pickTokenIcon({ name: 'Dire Wolf', creatureType: 'Beast' })).toBe('wolf-head')
    expect(pickTokenIcon({ name: 'Giant Spider', creatureType: 'Monstrosity' })).toBe('spider-web')
  })
  test('no match returns null so the token keeps its initials', () => {
    expect(pickTokenIcon({ name: 'Thorin Oakenshield' })).toBeNull()
    expect(pickTokenIcon({ name: '', role: '', race: 'Human', creatureType: 'Humanoid' })).toBeNull()
  })
  test('a saved override wins; a bad override is ignored', () => {
    const npc = { name: 'Goblin', role: '', race: '' }
    expect(npcTokenIcon({ ...npc, tokenIcon: 'ogre' })).toBe('ogre')
    expect(npcTokenIcon({ ...npc, tokenIcon: 'not-an-icon' })).toBe('goblin-head')
  })
})

test.describe('bundled icon set', () => {
  const paths = JSON.parse(fs.readFileSync('src/data/tokenIconPaths.json', 'utf8')) as Record<string, { a: string; d: string }>
  test('every catalog icon and every rule target has glyph data', () => {
    for (const [id] of TOKEN_ICON_CATALOG) expect(paths[id], id).toBeTruthy()
    for (const [icon] of TOKEN_ICON_RULES) {
      expect(isTokenIcon(icon), icon).toBe(true)
      expect(paths[icon], icon).toBeTruthy()
    }
    expect(new Set(TOKEN_ICON_CATALOG.map(([id]) => id)).size).toBe(TOKEN_ICON_CATALOG.length)
  })
  test('every bundled author is credited', () => {
    const credited = new Set(TOKEN_ICON_AUTHORS.map((a) => a.name))
    for (const [id, g] of Object.entries(paths)) expect(credited.has(g.a), id).toBe(true)
  })
})
