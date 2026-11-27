import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { makeCombatant, emptyCombat, type CombatState } from '../src/lib/combat'
import { revealWarningApplies, setRevealContext, setRevealPreview } from '../src/lib/revealContext'
import { duplicatePc, healthMarker, publicCombat, revealsNpc, type TokenFacts } from '../src/lib/liveCombat'

// Players see the initiative order, join it, and the DM is warned before NPCs appear
// (T-100). Pure logic first (the privacy filter), then the player strip through mocked
// Supabase responses, then the DM warning on the demo.

// ── Pure logic ───────────────────────────────────────────────────────────────

function combatWith(...rows: ReturnType<typeof makeCombatant>[]): CombatState {
  return { ...emptyCombat(), active: true, combatants: rows }
}
const noFacts = new Map<string, TokenFacts>()

test.describe('public combat rows', () => {
  test('allies show HP, enemies never do, and enemy initiative is visible', () => {
    const aria = makeCombatant({ name: 'Aria', isPC: true, hp: 31, initiative: 17 })
    const grok = makeCombatant({ name: 'Grok', hp: 59, initiative: 19 })
    const pc = publicCombat(combatWith(grok, aria), noFacts, {})!
    const g = pc.rows.find((r) => r.name === 'Grok')!
    const a = pc.rows.find((r) => r.name === 'Aria')!
    expect(g.initiative).toBe(19)
    expect(g.kind).toBe('enemy')
    expect(g.hp).toBeNull()
    expect(g.maxHp).toBeNull()
    expect(a.hp).toBe(31)
    // Row ids are random UUIDs and can contain "59", so look for the HP fields, not a bare substring.
    expect(JSON.stringify(pc.rows.filter((r) => r.kind === 'enemy'))).not.toMatch(/"(hp|maxHp)":59/)
  })

  test('hidden combatants and combatants on hidden tokens are never included', () => {
    const a = makeCombatant({ name: 'Visible', initiative: 5 })
    const b = { ...makeCombatant({ name: 'Flagged', initiative: 6 }), hiddenFromPlayers: true }
    const c = makeCombatant({ name: 'OnHiddenToken', initiative: 7 })
    const facts = new Map<string, TokenFacts>([[c.id, { hidden: true, controlledBy: null, friendly: false }]])
    const pc = publicCombat(combatWith(a, b, c), facts, {})!
    expect(pc.rows.map((r) => r.name)).toEqual(['Visible'])
  })

  test('a monster group is one row with a count and no member details', () => {
    const m = (n: string) => ({ ...makeCombatant({ name: n, hp: 11, initiative: 12, groupKey: 'g1', groupTurn: true }), conditions: ['Poisoned'] })
    const pc = publicCombat(combatWith(m('Thug 1'), m('Thug 2'), m('Thug 3')), noFacts, {}, new Map([['g1', 'Thugs']]))!
    expect(pc.rows).toHaveLength(1)
    expect(pc.rows[0]).toMatchObject({ name: 'Thugs', groupCount: 3, hp: null, conditions: [] })
    expect(JSON.stringify(pc)).not.toContain('Thug 1')
  })

  test('while gathering, only PCs are shared', () => {
    const s: CombatState = {
      ...emptyCombat(),
      askPlayers: true,
      combatants: [makeCombatant({ name: 'Aria', isPC: true }), makeCombatant({ name: 'Goblin' })],
    }
    const pc = publicCombat(s, noFacts, {})!
    expect(pc.phase).toBe('gathering')
    expect(pc.rows.map((r) => r.name)).toEqual(['Aria'])
    expect(publicCombat(emptyCombat(), noFacts, {})).toBeNull()
  })

  test('a player-controlled NPC counts as an ally and shows its HP', () => {
    const horse = { ...makeCombatant({ name: 'Biscuit', hp: 11 }), controlledBy: 'user-1' }
    const row = publicCombat(combatWith(horse), noFacts, {})!.rows[0]
    expect(row).toMatchObject({ kind: 'ally', hp: 11, controlledBy: 'user-1' })
  })
})

test.describe('health markers', () => {
  const foe = (hp: number) => makeCombatant({ name: 'Foe', hp: 100, initiative: 1 }) && { ...makeCombatant({ name: 'Foe' }), hp, maxHp: 100 }
  const all = { injured: true, bloodied: true, deathsDoor: true }

  test('off by default, even for a nearly dead enemy', () => {
    expect(healthMarker(foe(3), {})).toBeNull()
  })
  test('thresholds: 50, 25 and under 5 percent', () => {
    expect(healthMarker(foe(51), all)).toBeNull()
    expect(healthMarker(foe(50), all)).toBe('injured')
    expect(healthMarker(foe(26), all)).toBe('injured')
    expect(healthMarker(foe(25), all)).toBe('bloodied')
    expect(healthMarker(foe(5), all)).toBe('bloodied')
    expect(healthMarker(foe(4), all)).toBe('deaths_door')
    expect(healthMarker(foe(0), all)).toBeNull()
  })
  test('each marker is its own opt-in', () => {
    expect(healthMarker(foe(40), { deathsDoor: true })).toBeNull()
    expect(healthMarker(foe(20), { injured: true })).toBe('injured')
  })
  test('a per-combatant override wins over the campaign', () => {
    expect(healthMarker({ ...foe(20), showHealthMarker: false }, all)).toBeNull()
    expect(healthMarker({ ...foe(20), showHealthMarker: true }, {})).toBe('bloodied')
  })
  test('only the marker, never HP or a percentage, reaches the row', () => {
    const c = { ...foe(20), initiative: 8 }
    const row = publicCombat(combatWith(c), noFacts, all)!.rows[0]
    expect(row.healthMarker).toBe('bloodied')
    expect(row.hp).toBeNull()
    expect(JSON.stringify(row)).not.toMatch(/\b(20|100|0\.2)\b/)
  })
})

test.describe('reveal rules', () => {
  test('PCs and hidden combatants do not trigger the warning; NPCs do', () => {
    expect(revealsNpc([makeCombatant({ name: 'Aria', isPC: true })])).toBe(false)
    expect(revealsNpc([{ ...makeCombatant({ name: 'Ambusher' }), hiddenFromPlayers: true }])).toBe(false)
    expect(revealsNpc([makeCombatant({ name: 'Goblin' })])).toBe(true)
  })
  test('a PC the DM adds for a player who already joined is a duplicate', () => {
    const joined = { ...makeCombatant({ name: 'Aria', isPC: true }), controlledBy: 'u1' }
    const s = combatWith(joined)
    expect(duplicatePc(s, ' aria ', 'u1')).toBeDefined()
    expect(duplicatePc(s, 'Aria', 'u2')).toBeUndefined()
    expect(duplicatePc(s, 'Aria', null)).toBeUndefined()
  })
})

test.describe('the warning is DM only', () => {
  const ctx = { campaignId: 'c', isDm: true, sessionLive: true, facts: new Map<string, TokenFacts>() }
  test.afterEach(() => {
    setRevealContext(null)
    setRevealPreview(false)
  })
  test('applies only with a DM context in a live session, and not in player preview', () => {
    expect(revealWarningApplies()).toBe(false) // no context: any player page
    setRevealContext(ctx)
    expect(revealWarningApplies()).toBe(true)
    setRevealPreview(true)
    expect(revealWarningApplies()).toBe(false)
    setRevealPreview(false)
    setRevealContext({ ...ctx, sessionLive: false })
    expect(revealWarningApplies()).toBe(false)
    setRevealContext({ ...ctx, isDm: false })
    expect(revealWarningApplies()).toBe(false)
  })
})

test('player code never imports the DM reveal guard', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
  const files = walk('src').filter((f) => /(^|\/)(Player[A-Za-z]*\.tsx?)$/.test(f) || f.endsWith('PlayerTurnStrip.tsx'))
  expect(files.length).toBeGreaterThan(3)
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    expect(src, f).not.toMatch(/revealGuard|confirmReveal|useConfirmReveal/)
  }
})

// ── Player strip (mocked Supabase) ───────────────────────────────────────────

const LINKED = '8f1c0b7e-0000-4000-8000-00000000a001'
const LOCAL = 'player-camp-init'
const ME = '11111111-1111-4111-8111-111111111111'
const NOTE = 'note-brann'

type Mock = { rows: Record<string, unknown>[]; calls: { name: string; body: Record<string, unknown> }[]; phase?: 'gathering' | 'active' }

const row = (o: Record<string, unknown>) => ({
  campaign_id: LINKED, controlled_by: null, source: 'dm', kind: 'enemy', initiative: 10, sort_order: 0,
  hp: null, max_hp: null, health_marker: null, conditions: [], group_count: null, ...o,
})

async function seedPlayer(page: Page) {
  // A signed-in session with a far-future expiry, so supabase-js never refreshes it.
  await page.addInitScript(
    ([id]) => {
      localStorage.setItem(
        'sb-e2e-placeholder-auth-token',
        JSON.stringify({
          access_token: 'e2e-token', refresh_token: 'e2e-refresh', token_type: 'bearer',
          expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000,
          user: { id, aud: 'authenticated', role: 'authenticated', email: 'player@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
        }),
      )
    },
    [ME],
  )
  await page.goto('/')
  await page.waitForFunction(async () => (await indexedDB.databases()).some((d) => d.name === 'dnd-codex'))
  await page.evaluate(
    async ([cid, linked, note]) => {
      await new Promise<void>((res, rej) => {
        const r = indexedDB.open('dnd-codex')
        r.onerror = () => rej(r.error)
        r.onsuccess = () => {
          const tx = r.result.transaction(['campaigns', 'playerNotes'], 'readwrite')
          const t = '2026-01-01T00:00:00Z'
          tx.objectStore('campaigns').put({ id: cid, name: 'Player copy', role: 'player', linkedCampaignId: linked, createdAt: t, updatedAt: t })
          tx.objectStore('playerNotes').put({
            id: note, campaignId: cid, section: 'character', title: 'Brann', body: '', tags: [], date: '', status: '',
            characterData: { abilities: { dex: 14 }, maxHp: 38, currentHp: 38 }, createdAt: t, updatedAt: t,
          })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(tx.error)
        }
      })
    },
    [LOCAL, LINKED, NOTE],
  )
}

async function mockCombat(page: Page, mock: Mock, shared = true) {
  await page.route('**/rest/v1/live_sessions*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ campaign_id: LINKED, session_id: null, title: 'Test session', session_date: '', started_at: new Date().toISOString(), discord_voice: null }) }),
  )
  await page.route('**/rest/v1/shared_combat?*', (route) =>
    shared
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ campaign_id: LINKED, phase: mock.phase ?? 'active', round: 2, active_ids: mock.phase === 'gathering' ? [] : ['aria'], updated_at: '2026-01-01T00:00:00Z' }) })
      : route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'no rows', details: '', hint: '' }) }),
  )
  await page.route('**/rest/v1/shared_combatants*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(mock.rows) }))
  for (const name of ['join_combat', 'set_combat_initiative', 'leave_combat']) {
    await page.route(`**/rest/v1/rpc/${name}`, (route) => {
      mock.calls.push({ name, body: route.request().postDataJSON() })
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify('new-row-id') })
    })
  }
}

const rowsFor = (withMe: boolean) => [
  row({ id: 'grok', name: 'Grok the Ogre', initiative: 19, sort_order: 0, health_marker: 'bloodied' }),
  row({ id: 'aria', name: 'Aria', kind: 'pc', initiative: 17, sort_order: 1, hp: 24, max_hp: 31, source: 'player', controlled_by: '22222222-2222-4222-8222-222222222222' }),
  ...(withMe ? [row({ id: 'brann', name: 'Brann', kind: 'pc', initiative: 14, sort_order: 2, hp: 38, max_hp: 38, source: 'player', controlled_by: ME })] : []),
  row({ id: 'thugs', name: 'Thugs', initiative: 12, sort_order: 3, group_count: 3 }),
]

const revealDialog = (page: Page) => page.getByRole('dialog', { name: /Show these combatants/ })

async function expectPopClear(page: Page, vp: { width: number; height: number }, stripFree = true) {
  const strip = page.getByTestId('initiative-strip')
  const pop = page.getByTestId('join-pop')
    const sb = (await strip.boundingBox())!
    const pb = (await pop.boundingBox())!
    const apart = pb.y + pb.height <= sb.y + 1 || pb.y >= sb.y + sb.height - 1 || pb.x + pb.width <= sb.x + 1 || pb.x >= sb.x + sb.width - 1
    expect(apart, `pop ${JSON.stringify(pb)} overlaps strip ${JSON.stringify(sb)}`).toBe(true)
    expect(pb.x).toBeGreaterThanOrEqual(0)
    expect(pb.y).toBeGreaterThanOrEqual(0)
    expect(pb.x + pb.width).toBeLessThanOrEqual(vp.width + 1)
    expect(pb.y + pb.height, `pop ${JSON.stringify(pb)} strip ${JSON.stringify(sb)} style ${await pop.getAttribute('style')}`).toBeLessThanOrEqual(vp.height + 1)
    // The strip itself stays unobstructed.
    const stripTop = await strip.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!t && el.contains(t)
    })
    if (stripFree) expect(stripTop, 'something covers the strip').toBe(true)
    // Nothing covers a pop-up button: scroll each into view, then hit-test its centre.
    const buttons = pop.getByRole('button')
    const n = await buttons.count()
    expect(n).toBeGreaterThan(0)
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i)
      await b.scrollIntoViewIfNeeded()
      const ok = await b.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return !!t && (t === el || el.contains(t))
      })
      expect(ok, `something covers pop-up button ${i}`).toBe(true)
    }
}

test.describe('player initiative panel (T-108)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('Join initiative sits in the turn strip, its pop-up opens next to it, and joining calls join_combat once', async ({ page }) => {
    const mock: Mock = { rows: rowsFor(false), calls: [], phase: 'gathering' }
    await seedPlayer(page)
    await mockCombat(page, mock)
    await page.goto(`/#/player/${LOCAL}/session`)
    const strip = page.getByTestId('initiative-strip')
    await expect(strip).toHaveClass(/bm-turns/)
    await expect(strip.getByTestId('strip-round')).toHaveText('Roll for initiative')
    await expect(page.getByTestId('initiative-badge')).toBeVisible()
    // No Join control in the list any more.
    await expect(page.getByTestId('initiative-list').getByTestId('join-initiative')).toHaveCount(0)
    const btn = strip.getByTestId('join-initiative')
    await expect(btn).toHaveText('Join initiative')
    await btn.click()
    const pop = page.getByTestId('join-pop')
    await expect(pop).toBeVisible()
    const sb = await strip.boundingBox()
    const pb = await pop.boundingBox()
    // The pop-up never covers the strip: it opens above it, or below it when there is no room above.
    expect(pb!.y + pb!.height <= sb!.y + 1 || pb!.y >= sb!.y + sb!.height - 1).toBe(true)
    await expect(pop.getByRole('combobox', { name: 'Character' })).toContainText('Brann')
    await expect(pop.getByTestId('join-hp')).toContainText('38 / 38')
    await pop.getByRole('spinbutton', { name: 'Initiative', exact: true }).fill('15')
    await pop.getByTestId('join-submit').click()
    await expect(pop).toHaveCount(0)
    expect(mock.calls).toHaveLength(1)
    expect(mock.calls[0]).toMatchObject({ name: 'join_combat', body: { cid: LINKED, pname: 'Brann', init: 15, hp_now: 38, hp_max: 38, ckey: NOTE } })
    await expect(revealDialog(page)).toHaveCount(0)
  })

  for (const vp of [
    { name: '1280x720', width: 1280, height: 720 },
    { name: '1440x900', width: 1440, height: 900 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'phone portrait', width: 390, height: 844 },
    { name: 'phone landscape', width: 844, height: 390 },
  ]) {
    test(`the join pop-up stays inside the visible map area and its buttons are clickable (${vp.name})`, async ({ page }) => {
      const mock: Mock = { rows: rowsFor(false), calls: [], phase: 'gathering' }
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await seedPlayer(page)
      await mockCombat(page, mock)
      await page.goto(`/#/player/${LOCAL}/session`)
      await page.getByTestId('initiative-strip').getByTestId('join-initiative').click()
      const pop = page.getByTestId('join-pop')
      await expect(pop).toBeVisible()
      const pb = (await pop.boundingBox())!
      const hb = await page.locator('.session-header').boundingBox()
      expect(pb.y).toBeGreaterThanOrEqual(0)
      if (hb) expect(pb.y).toBeGreaterThanOrEqual(hb.y + hb.height - 1)
      expect(pb.x + pb.width).toBeLessThanOrEqual(vp.width + 1)
      await pop.getByTestId('join-submit').click()
      expect(mock.calls.filter((c) => c.name === 'join_combat')).toHaveLength(1)
    })
  }

  // T-118: the pop-up is portalled to <body> and must sit clear of the strip and on top of everything,
  // on the session page and in full screen (demo, where Demo controls also float over the map).
  const SIZES = [
    { name: 'desktop 1280x720', width: 1280, height: 720 },
    { name: 'phone portrait 390x844', width: 390, height: 844 },
    { name: 'phone landscape 844x390', width: 844, height: 390 },
    { name: 'small landscape 667x375', width: 667, height: 375 },
  ]
  for (const vp of SIZES) {
    test(`the join pop-up is clear of the strip and nothing covers it (signed in, ${vp.name})`, async ({ page }) => {
      const mock: Mock = { rows: rowsFor(false), calls: [], phase: 'gathering' }
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await seedPlayer(page)
      await mockCombat(page, mock)
      await page.goto(`/#/player/${LOCAL}/session`)
      await page.getByTestId('initiative-strip').getByTestId('join-initiative').click()
      await expect(page.getByTestId('join-pop')).toBeVisible()
      await expectPopClear(page, vp)
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('join-pop')).toHaveCount(0)
    })
    for (const mode of ['page', 'full screen'] as const) {
      for (const controls of [false, true]) {
        test(`the join pop-up is clear and on top in the demo (${mode}, Demo controls ${controls ? 'open' : 'closed'}, ${vp.name})`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height })
          await page.goto('/#/')
          await page.getByRole('button', { name: 'Try the live demo' }).click()
          await page.getByTestId('demo-player-entry').click()
          await page.locator('.session-vtt').waitFor()
          if (mode === 'full screen') {
            await page.getByRole('button', { name: 'Full screen' }).first().click()
            await expect(page.locator('.player-live-board.expanded')).toBeVisible()
          }
          const toggle = page.getByTestId('demo-controls-toggle').first()
          await toggle.click()
          await page.getByTestId('demo-ask').click()
          await toggle.click()
          await expect(page.getByTestId('initiative-strip')).toBeVisible()
          if (controls) await toggle.click()
          // With the Demo controls open they may sit over the Join button, so open the pop-up from script.
          await page.getByTestId('initiative-strip').getByTestId('join-initiative').evaluate((el: HTMLElement) => el.click())
          await expect(page.getByTestId('join-pop')).toBeVisible()
          await page.screenshot({ path: `test-results/join-pop-${mode.replace(' ', '')}-${controls ? 'ctl' : 'noctl'}-${vp.width}x${vp.height}.png` })
          await expectPopClear(page, vp, !controls)
          await page.keyboard.press('Escape')
          await expect(page.getByTestId('join-pop')).toHaveCount(0)
        })
      }
    }
  }

  test('the strip shows the round, the active chip, and no HP or Next for a player', async ({ page }) => {
    const mock: Mock = { rows: rowsFor(true), calls: [] }
    await seedPlayer(page)
    await mockCombat(page, mock)
    await page.goto(`/#/player/${LOCAL}/session`)
    const strip = page.getByTestId('initiative-strip')
    await expect(strip.getByTestId('strip-round')).toHaveText('Round 2')
    await expect(strip).toContainText("Aria's turn")
    await expect(strip.getByTestId('strip-chip')).toHaveCount(4)
    await expect(strip.locator('.bm-chip.turn')).toHaveCount(1)
    await expect(strip.locator('.bm-chip.turn')).toHaveText('A')
    await expect(strip.getByRole('button', { name: /Next/ })).toHaveCount(0)
    await expect(strip.getByTestId('end-turn')).toHaveCount(0)
    await expect(strip).not.toContainText('HP')
    // The prompt is quiet once combat is running and you are in.
    await expect(page.getByTestId('initiative-badge')).toHaveCount(0)
  })

  test('a player edits their own initiative and leaves, each through its own call; others are read-only', async ({ page }) => {
    const mock: Mock = { rows: rowsFor(true), calls: [] }
    await seedPlayer(page)
    await mockCombat(page, mock)
    await page.goto(`/#/player/${LOCAL}/session`)
    await expect(page.locator('.il-row.mine')).toHaveCount(1)
    await expect(page.locator('.il-row:not(.mine) input')).toHaveCount(0)
    await expect(page.locator('.il-row:not(.mine) .il-x')).toHaveCount(0)
    const field = page.getByRole('spinbutton', { name: 'Edit Brann initiative' })
    await field.fill('9')
    await field.press('Enter')
    await expect.poll(() => mock.calls.filter((c) => c.name === 'set_combat_initiative').length).toBe(1)
    await expect.poll(() => mock.calls.find((c) => c.name === 'set_combat_initiative')?.body).toMatchObject({ cid: LINKED, rid: 'brann', init: 9 })
    await page.getByRole('button', { name: 'Remove Brann from initiative' }).click()
    await expect.poll(() => mock.calls.find((c) => c.name === 'leave_combat')?.body).toMatchObject({ cid: LINKED, rid: 'brann' })
    await expect(revealDialog(page)).toHaveCount(0)
  })

  test('Set my initiative and Leave combat from the strip pop-up', async ({ page }) => {
    const mock: Mock = { rows: rowsFor(true), calls: [] }
    await seedPlayer(page)
    await mockCombat(page, mock)
    await page.goto(`/#/player/${LOCAL}/session`)
    await page.getByTestId('strip-options').click()
    const pop = page.getByTestId('join-pop')
    await pop.getByRole('spinbutton', { name: 'Initiative', exact: true }).fill('21')
    await pop.getByTestId('join-submit').click()
    await expect.poll(() => mock.calls.find((c) => c.name === 'set_combat_initiative')?.body).toMatchObject({ rid: 'brann', init: 21 })
    await page.getByTestId('strip-options').click()
    await page.getByTestId('leave-combat').click()
    await expect.poll(() => mock.calls.find((c) => c.name === 'leave_combat')?.body).toMatchObject({ rid: 'brann' })
  })

  test('no strip, and no join button, when the DM is not sharing combat', async ({ page }) => {
    const mock: Mock = { rows: [], calls: [] }
    await seedPlayer(page)
    await mockCombat(page, mock, false)
    await page.goto(`/#/player/${LOCAL}/session`)
    await expect(page.locator('.session-page')).toBeVisible()
    await expect(page.getByTestId('initiative-strip')).toHaveCount(0)
    await expect(page.getByTestId('join-initiative')).toHaveCount(0)
    expect(mock.calls).toHaveLength(0)
  })
})

// ── DM warning (demo) ────────────────────────────────────────────────────────

test.describe('DM warning before NPCs appear', () => {
  test.use({ viewport: { width: 1440, height: 900 }, skipRevealWarning: false })

  async function openStudio(page: Page, supabaseRequests: string[]) {
    void supabaseRequests
    await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
    await page.goto('/#/campaign/demo-campaign-0001/battlemap')
    await page.locator('.battlemap-maps .list-row').first().click()
    await expect(page.getByTestId('bm-studio')).toBeVisible()
  }
  const addToCombat = async (page: Page, name: string) => {
    await page.getByTestId('bm-inspector').getByRole('button', { name, exact: true }).click()
    await page.locator('.tabletop-quickcombat').getByRole('button', { name: 'Add to combat' }).click()
  }
  const turns = (page: Page) => page.getByTestId('bm-turns')

  test('Start combat lists every NPC; Cancel keeps it unstarted; the checkbox saves a preference', async ({ page, supabaseRequests }) => {
    await openStudio(page, supabaseRequests)
    await addToCombat(page, 'Bram')
    await addToCombat(page, 'Mordrek')
    // Combat is not active, so adding showed nothing.
    await expect(revealDialog(page)).toHaveCount(0)
    await turns(page).getByRole('button', { name: 'Start combat' }).click()
    await expect(revealDialog(page)).toBeVisible()
    await expect(page.getByTestId('reveal-names')).toContainText('Mordrek')
    await expect(page.getByText('Everyone in the live session will see these combatants once they appear')).toBeVisible()
    await revealDialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(turns(page).getByRole('button', { name: 'Start combat' })).toBeVisible()

    await turns(page).getByRole('button', { name: 'Start combat' }).click()
    await revealDialog(page).getByRole('button', { name: 'Add' }).click()
    await expect(turns(page).locator('.bm-turns-round')).toContainText('Round 1')

    // Active now: every add asks again, until the DM ticks the box.
    await addToCombat(page, 'Sable')
    await expect(revealDialog(page)).toBeVisible()
    await revealDialog(page).getByLabel("Don't show this message again").check()
    await revealDialog(page).getByRole('button', { name: 'Add' }).click()
    await expect(turns(page).locator('.bm-chip')).toHaveCount(3)
    await addToCombat(page, 'Vara')
    await expect(revealDialog(page)).toHaveCount(0)
    await expect(turns(page).locator('.bm-chip')).toHaveCount(4)
    expect(await page.evaluate(() => localStorage.getItem('codex.confirmSkip.combat-reveal'))).toBe('1')
    expect(supabaseRequests).toEqual([])
  })

  test('Cancel on an add while active adds nothing', async ({ page, supabaseRequests }) => {
    await openStudio(page, supabaseRequests)
    await addToCombat(page, 'Bram')
    await turns(page).getByRole('button', { name: 'Start combat' }).click()
    await revealDialog(page).getByRole('button', { name: 'Add' }).click()
    await addToCombat(page, 'Mordrek')
    await expect(revealDialog(page)).toBeVisible()
    await revealDialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(turns(page).locator('.bm-chip')).toHaveCount(1)
  })
})
