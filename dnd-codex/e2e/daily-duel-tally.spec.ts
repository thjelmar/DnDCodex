import { test, expect } from '@playwright/test'
import { LIVE } from './live'

// Daily Duel tally (T-66) against a LOCAL Supabase stack with migration 0041
// applied. Skips in `npm run e2e`; run with `npm run e2e:live` (see README).

const URL_ = process.env.E2E_SUPABASE_URL ?? ''
const ANON = process.env.E2E_SUPABASE_ANON_KEY ?? ''
const SERVICE = process.env.E2E_SUPABASE_SERVICE_KEY ?? ''
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)

const rpc = (fn: string, body: unknown, key = ANON) =>
  fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
const record = (d: string, outcome: string, extra: Record<string, unknown> = {}) =>
  rpc('record_duel_result', {
    p_day: d, p_tier: 'standard', p_outcome: outcome, p_rounds: 5, p_hero_id: 'fighter', p_foe_id: 'orc',
    p_twist_id: 'blessed', p_device_id: crypto.randomUUID(), ...extra,
  }).then((r) => r.json())

test.describe('daily duel tally (live)', () => {
  test.skip(!LIVE, 'Needs a local Supabase stack. Run `npm run e2e:live`. See e2e/README.md.')
  test.describe.configure({ mode: 'serial' })

  const clean = async () => {
    const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
    for (const t of ['daily_duel_results', 'daily_twists']) {
      await fetch(`${URL_}/rest/v1/${t}?day=gte.1970-01-01`, { method: 'DELETE', headers: h })
    }
  }
  test.beforeAll(clean)
  test.afterAll(clean)

  test('validates input, keeps the first result per device, and hides rows', async () => {
    const d = day(0)
    const dev = crypto.randomUUID()
    expect(await record(d, 'won', { p_device_id: dev })).toBe(true)
    expect(await record(d, 'lost', { p_device_id: dev })).toBe(false) // first result stands
    expect(await record(day(-5), 'won')).toBe(false) // too old
    expect(await record(day(3), 'won')).toBe(false) // too far ahead
    expect(await record(d, 'draw')).toBe(false)
    expect(await record(d, 'won', { p_tier: 'nightmare' })).toBe(false)
    expect(await record(d, 'won', { p_rounds: 0 })).toBe(false)
    expect(await record(d, 'won', { p_hero_id: 'x'.repeat(41) })).toBe(false)
    // Nobody can read rows: anon gets nothing back from the table.
    const rows = await fetch(`${URL_}/rest/v1/daily_duel_results?select=*`, { headers: { apikey: ANON } })
    const body = await rows.json()
    expect(Array.isArray(body) ? body : []).toEqual([])
    const direct = await fetch(`${URL_}/rest/v1/daily_duel_results`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: d, tier: 'easy', outcome: 'won', rounds: 1, hero_id: 'a', foe_id: 'b', twist_id: '', device_id: crypto.randomUUID() }),
    })
    expect(direct.ok).toBe(false)
  })

  test('leans toward the foe after an easy day, persists it, and needs 20 duels', async () => {
    const today = day(0)
    const yesterday = day(-1)
    expect(await rpc('get_duel_lean', { p_day: day(1) }).then((r) => r.json())).toBeNull() // future day
    for (let i = 0; i < 19; i++) await record(yesterday, 'won')
    expect(await rpc('get_duel_lean', { p_day: today }).then((r) => r.json())).toBeNull() // 19 < 20
    await record(yesterday, 'won') // 20 wins vs a 65% target
    expect(await rpc('get_duel_lean', { p_day: today }).then((r) => r.json())).toBe('foe')
    for (let i = 0; i < 30; i++) await record(yesterday, 'lost') // would now be 40% => hero, but the answer is persisted
    expect(await rpc('get_duel_lean', { p_day: today }).then((r) => r.json())).toBe('foe')
    const stats = await rpc('get_duel_stats', { p_day: yesterday }).then((r) => r.json())
    expect(stats[0].played).toBe(50)
  })
})
