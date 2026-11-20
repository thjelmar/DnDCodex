import { test, expect } from '@playwright/test'
import { OVERVIEW_LAYOUT_ID } from '../src/lib/overviewCards'
import { cloudIdFor, isUuid, uuidV5, GLOBAL_ID_NAMESPACE } from '../src/lib/globalSyncId'

// T-93: the id mapping for the account-level sync. Pure logic, no browser or backend.
const V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test.describe('global sync cloud ids', () => {
  test('uuidV5 matches the RFC 4122 reference vector', async () => {
    // From RFC 4122 appendix B / Python uuid.uuid5(NAMESPACE_DNS, 'python.org').
    expect(await uuidV5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d')
  })

  test('a slot or a day maps to a valid, deterministic v5 uuid', async () => {
    const a = await cloudIdFor('genTable', 'tavern-name')
    expect(a).toMatch(V5)
    expect(await cloudIdFor('genTable', 'tavern-name')).toBe(a)
    expect(a).toBe('0dfe5d73-0ed3-52a3-83ca-1afcb0bb685f') // golden value: changing it orphans cloud rows
    const d = await cloudIdFor('duelRecord', '2026-11-18')
    expect(d).toMatch(V5)
    expect(d).not.toBe(a)
  })

  test('the kind is part of the hash, and different keys differ', async () => {
    expect(await cloudIdFor('genTable', 'x')).not.toBe(await cloudIdFor('duelRecord', 'x'))
    expect(await cloudIdFor('duelRecord', '2026-11-18')).not.toBe(await cloudIdFor('duelRecord', '2026-11-19'))
  })

  test('a key that is already a uuid is used as it is', async () => {
    const id = crypto.randomUUID()
    expect(await cloudIdFor('template', id)).toBe(id)
    expect(await cloudIdFor('template', id.toUpperCase())).toBe(id)
    expect(isUuid(id)).toBe(true)
    expect(isUuid('tavern-name')).toBe(false)
  })

  test('the saved Overview layout key (a fixed uuid) is not remapped', async () => {
    expect(isUuid(OVERVIEW_LAYOUT_ID)).toBe(true)
    expect(await cloudIdFor('overviewLayout', OVERVIEW_LAYOUT_ID)).toBe(OVERVIEW_LAYOUT_ID)
  })

  test('the namespace constant is a uuid', () => {
    expect(isUuid(GLOBAL_ID_NAMESPACE)).toBe(true)
  })
})
