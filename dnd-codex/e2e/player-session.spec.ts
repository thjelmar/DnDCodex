import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// The player session screen (T-104): top bar, docked panel with tabs, empty states,
// and players ending their own turn. Supabase is mocked, as in player-initiative.spec.ts.


const LINKED = '8f1c0b7e-0000-4000-8000-00000000a001'
const LOCAL = 'player-camp-init'
const ME = '11111111-1111-4111-8111-111111111111'
const NOTE = 'note-brann'

type Mock = { rows: Record<string, unknown>[]; calls: { name: string; body: Record<string, unknown> }[] }

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

async function mockCombat(page: Page, mock: Mock, shared = true, activeId = 'aria') {
  await page.route('**/rest/v1/live_sessions*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ campaign_id: LINKED, session_id: null, title: 'Test session', session_date: '', started_at: new Date().toISOString(), discord_voice: null }) }),
  )
  await page.route('**/rest/v1/shared_combat?*', (route) =>
    shared
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ campaign_id: LINKED, phase: 'active', round: 2, active_ids: [activeId], updated_at: '2026-01-01T00:00:00Z' }) })
      : route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'no rows', details: '', hint: '' }) }),
  )
  await page.route('**/rest/v1/shared_combatants*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(mock.rows) }))
  for (const name of ['join_combat', 'set_combat_initiative', 'leave_combat', 'end_my_turn']) {
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

const chips = (page: Page) => page.getByTestId('strip-chip')
const revealDialog = (page: Page) => page.getByRole('dialog', { name: /Show these combatants/ })

const tabs = (page: Page) => page.getByRole('tab')

test.describe('player session shell', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('the docked panel has four tabs, and no combat shows an empty state, not nothing', async ({ page }) => {
    const mock: Mock = { rows: [], calls: [] }
    await seedPlayer(page)
    await mockCombat(page, mock, false)
    await page.goto(`/#/player/${LOCAL}/session`)
    await expect(tabs(page)).toHaveText(['Initiative', 'Me', 'Notes', 'Handouts'])
    await page.getByRole('tab', { name: 'Initiative' }).click()
    await expect(page.getByTestId('initiative-empty')).toContainText('No combat yet')
    await expect(page.getByTestId('your-turn')).toHaveCount(0)
  })

  test('the Initiative tab lists the order: enemy initiative and marker, no enemy HP, ally HP', async ({ page }) => {
    const mock: Mock = { rows: rowsFor(true), calls: [] }
    await seedPlayer(page)
    await mockCombat(page, mock)
    await page.goto(`/#/player/${LOCAL}/session`)
    await expect(page.getByTestId('top-round')).toContainText('Round 2')
    const rows = page.getByTestId('dock-row')
    await expect(rows).toHaveCount(4)
    await expect(rows.nth(0)).toContainText('19')
    await expect(rows.nth(0).getByTestId('dock-marker')).toHaveText('Bloodied')
    await expect(rows.nth(0).getByTestId('dock-hp')).toHaveCount(0)
    await expect(rows.nth(1).getByTestId('dock-hp')).toHaveText('24 / 31')
    await expect(page.locator('.il-row.mine')).toHaveCount(1)
    // The DM tracker's look: header with counts, round avatar, initiative number, highlighted turn.
    await expect(page.locator('.il-head strong')).toHaveText('Initiative')
    await expect(page.getByTestId('il-count')).toContainText('4 turns · 6 combatants')
    await expect(rows.nth(0).locator('.il-av')).toHaveText('GT')
    await expect(rows.nth(0).locator('.il-ini')).toHaveText('19')
    expect(await rows.nth(0).locator('.il-av').evaluate((el) => getComputedStyle(el).borderRadius)).toMatch(/50%|\d+px/)
  })

  test('Me shows the character, and Handouts has its heading', async ({ page }) => {
    const mock: Mock = { rows: rowsFor(true), calls: [] }
    await seedPlayer(page)
    await mockCombat(page, mock)
    await page.goto(`/#/player/${LOCAL}/session`)
    await page.getByRole('tab', { name: 'Me' }).click()
    await expect(page.getByTestId('me-tab')).toContainText('Brann')
    await expect(page.getByTestId('me-hp')).toHaveText('38/38')
    await page.getByRole('button', { name: 'Lose 1 HP' }).click()
    await expect(page.getByTestId('me-hp')).toHaveText('37/38')
    await page.getByRole('tab', { name: 'Handouts' }).click()
    await expect(page.getByText('Shared by your DM')).toBeVisible()
  })
})

test.describe('ending your own turn', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('no End turn when it is someone else\'s turn', async ({ page }) => {
    const mock: Mock = { rows: rowsFor(true), calls: [] }
    await seedPlayer(page)
    await mockCombat(page, mock, true, 'aria')
    await page.goto(`/#/player/${LOCAL}/session`)
    await expect(page.getByTestId('dock-row').first()).toBeVisible()
    await expect(page.getByTestId('your-turn')).toHaveCount(0)
    await expect(page.getByTestId('end-turn')).toHaveCount(0)
  })

  test('on your turn the strip shows End turn, and it calls end_my_turn once for your row', async ({ page }) => {
    const mock: Mock = { rows: rowsFor(true), calls: [] }
    await seedPlayer(page)
    await mockCombat(page, mock, true, 'brann')
    await page.goto(`/#/player/${LOCAL}/session`)
    await expect(page.getByTestId('your-turn')).toContainText('Your turn · Brann')
    await page.getByTestId('end-turn').click()
    await expect(page.getByTestId('end-turn')).toHaveText('Waiting for your DM…')
    expect(mock.calls.filter((c) => c.name === 'end_my_turn')).toHaveLength(1)
    expect(mock.calls.find((c) => c.name === 'end_my_turn')?.body).toMatchObject({ cid: LINKED, rid: 'brann' })
  })
})

test.describe('phone portrait', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test('the panel stacks under the map with no horizontal scroll', async ({ page }) => {
    const mock: Mock = { rows: rowsFor(true), calls: [] }
    await seedPlayer(page)
    await mockCombat(page, mock, true, 'brann')
    await page.goto(`/#/player/${LOCAL}/session`)
    await expect(page.getByTestId('player-dock')).toBeVisible()
    await expect(page.getByTestId('end-turn')).toBeVisible()
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over).toBeLessThanOrEqual(1)
  })
})
