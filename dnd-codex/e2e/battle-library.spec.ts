import { test, expect } from './fixtures'
import {
  LIVE,
  createTestUser,
  deleteTestUser,
  signInPage,
  seedLibraryTemplate,
  removeLibraryTemplate,
  restAs,
  type TestUser,
} from './live'

// Battle map library (T-76). The placeholder-backend tests run in `npm run e2e`;
// the live tests need the local Supabase stack (`npm run e2e:live`).

test.describe('battle map library without a reachable backend', () => {
  test('shows a load notice and keeps the rest of the app working', async ({ page, supabaseRequests }) => {
    test.skip(LIVE, 'This test needs the unreachable placeholder backend, not the live stack.')
    await page.goto('/#/tools/battlemaps')
    await expect(page.getByRole('heading', { name: 'Battle map library' })).toBeVisible()
    // The placeholder backend aborts every request, so the catalogue can't load. The
    // client retries a failed read a few times first, so allow for that.
    await expect(page.getByText("The library didn't load")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    expect(supabaseRequests.length).toBeGreaterThan(0)
  })

  test('the demo hides the library and makes no Supabase request for it', async ({ page, supabaseRequests }) => {
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Try the live demo' }).click()
    await expect(page.locator('.demo-banner')).toBeVisible()
    supabaseRequests.length = 0
    await page.evaluate(() => performance.clearResourceTimings())

    // The nav link is hidden in the demo.
    await expect(page.getByRole('link', { name: 'Battle map library' })).toHaveCount(0)
    // A direct visit shows the unavailable notice, not a broken page.
    await page.evaluate(`location.hash = '#/tools/battlemaps'`)
    await expect(page.getByTestId('library-unavailable')).toBeVisible()
    await page.waitForTimeout(600)
    expect(supabaseRequests, 'the demo library must not reach the Supabase host').toEqual([])

    // The battle map page in the demo has no Browse library button.
    await page.evaluate(`location.hash = '#/'`)
    await page.locator('.home-ccard').first().click()
    await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
    const id = new URL(page.url()).hash.split('/')[2]
    await page.evaluate(`location.hash = '#/campaign/${id}/battlemap'`)
    await expect(page.getByRole('button', { name: 'New Battle Map' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Browse library' })).toHaveCount(0)
  })
})

test.describe('battle map library (live backend)', () => {
  test.skip(!LIVE, 'Needs a local Supabase stack. Run `npm run e2e:live`. See e2e/README.md.')

  let user: TestUser
  const created: string[] = []
  test.afterEach(async () => {
    for (const id of created.splice(0)) await removeLibraryTemplate(id)
    if (user) await deleteTestUser(user)
  })

  test('signed-out visitors see published maps only and can search', async ({ page }) => {
    const tag = `e2e${Date.now()}`
    created.push(await seedLibraryTemplate({ title: `Crypt ${tag}`, tags: [tag, 'crypt'], credit: 'Test Artist' }))
    created.push(await seedLibraryTemplate({ title: `Hidden ${tag}`, tags: [tag], status: 'draft' }))
    created.push(await seedLibraryTemplate({ title: `Tavern ${tag}`, tags: [tag, 'tavern'] }))

    await page.goto('/#/tools/battlemaps')
    await expect(page.getByTestId('library-card').filter({ hasText: `Crypt ${tag}` })).toBeVisible()
    await expect(page.getByTestId('library-card').filter({ hasText: `Tavern ${tag}` })).toBeVisible()
    await expect(page.getByText(`Hidden ${tag}`)).toHaveCount(0)
    await expect(page.getByText('Art: Test Artist')).toBeVisible()

    await page.getByRole('searchbox', { name: 'Search maps' }).fill(`tavern ${tag}`)
    await expect(page.getByTestId('library-card')).toHaveCount(1)
    await page.getByRole('searchbox', { name: 'Search maps' }).fill('')
    await page.getByRole('group', { name: 'Filter by tag' }).getByRole('button', { name: 'crypt', exact: true }).click()
    await expect(page.getByTestId('library-card').filter({ hasText: `Crypt ${tag}` })).toBeVisible()
    await expect(page.getByText(`Tavern ${tag}`)).toHaveCount(0)
  })

  test('using a map copies it into the campaign and survives the template being deleted', async ({ page }) => {
    user = await createTestUser()
    await signInPage(page, user)
    const title = `Copy ${Date.now()}`
    const id = await seedLibraryTemplate({ title, credit: 'Credit Line' })
    created.push(id)

    await page.goto('/#/')
    await page.getByRole('button', { name: 'Start a campaign' }).click()
    await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Library ${Date.now()}`)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
    const campaignId = new URL(page.url()).hash.split('/')[2]

    // From the battle map page, through the side panel.
    await page.goto(`/#/campaign/${campaignId}/battlemap`)
    await page.getByRole('button', { name: 'Browse library' }).click()
    await page.getByTestId('library-card').filter({ hasText: title }).click()
    await page.getByTestId('library-use').click()

    // The new scene opens in the editor with its credit.
    await expect(page.getByLabel('Battle map name')).toHaveValue(title)
    await expect(page.getByText('Map art: Credit Line')).toBeVisible()

    const scenes = await readScenes(page, campaignId)
    expect(scenes).toHaveLength(1)
    expect(scenes[0].grid).toMatchObject({ cellPx: 50, offsetX: 7, offsetY: 11, show: true })
    expect(scenes[0].tokens).toEqual([])
    expect(scenes[0].source).toMatchObject({ libraryId: id, version: 1, credit: 'Credit Line' })
    const imageId = scenes[0].imageId as string
    expect(await imageHasData(page, imageId)).toBe(true)

    // The library row and objects vanish: the campaign's copy still works.
    await removeLibraryTemplate(id)
    created.length = 0
    await page.reload()
    await page.getByText(title, { exact: true }).click()
    await expect(page.getByLabel('Battle map name')).toHaveValue(title)
    expect(await imageHasData(page, imageId)).toBe(true)
  })

  test('the database refuses writes from non-publishers and hides drafts and the publisher id', async () => {
    user = await createTestUser()
    const draft = await seedLibraryTemplate({ title: 'Draft', status: 'draft' })
    created.push(draft)
    const body = JSON.stringify({
      title: 'Nope',
      map_path: 'x/map.png',
      thumb_path: 'x/thumb.png',
      width: 10,
      height: 10,
      bytes: 10,
      grid: {},
      cols: 1,
      rows: 1,
      status: 'published',
    })
    // Signed out and signed in (non-publisher) cannot insert.
    expect((await restAs('anon', '/rest/v1/battle_map_templates', { method: 'POST', body })).ok).toBe(false)
    expect((await restAs(user, '/rest/v1/battle_map_templates', { method: 'POST', body })).ok).toBe(false)
    // Neither can read the draft, and neither can edit or delete anything.
    for (const who of ['anon', user] as const) {
      const rows = await (await restAs(who, `/rest/v1/battle_map_templates?id=eq.${draft}&select=id`)).json()
      expect(rows).toEqual([])
      await restAs(who, `/rest/v1/battle_map_templates?id=eq.${draft}`, { method: 'PATCH', body: JSON.stringify({ title: 'X' }) })
      await restAs(who, `/rest/v1/battle_map_templates?id=eq.${draft}`, { method: 'DELETE' })
    }
    const svcRow = await restAs('anon', '/rest/v1/battle_map_templates?select=created_by')
    expect(svcRow.ok, 'there is no created_by column to leak').toBe(false)
    // The publisher allowlist is not readable, and nobody can add themselves.
    expect(await (await restAs(user, '/rest/v1/library_publishers?select=user_id')).json()).toEqual([])
    expect(
      (await restAs(user, '/rest/v1/library_publishers', { method: 'POST', body: JSON.stringify({ user_id: user.id }) })).ok,
    ).toBe(false)
    // Storage: a non-publisher cannot upload, and nobody can list the bucket.
    const up = await restAs(user, '/storage/v1/object/battlemap-library/evil/map.png', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array([1, 2, 3]) as never,
    })
    expect(up.ok).toBe(false)
    const list = await restAs('anon', '/storage/v1/object/list/battlemap-library', {
      method: 'POST',
      body: JSON.stringify({ prefix: '', limit: 100 }),
    })
    expect(list.ok ? await list.json() : []).toEqual([])
    // The draft is still intact after the failed edit/delete attempts.
    const still = await fetch(`${process.env.E2E_SUPABASE_URL}/rest/v1/battle_map_templates?id=eq.${draft}&select=title`, {
      headers: { apikey: process.env.E2E_SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${process.env.E2E_SUPABASE_SERVICE_KEY}` },
    })
    expect(await still.json()).toEqual([{ title: 'Draft' }])
  })
})

type Page = import('@playwright/test').Page

function readScenes(page: Page, campaignId: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    (c) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const open = indexedDB.open('dnd-codex')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result.transaction('scenes', 'readonly').objectStore('scenes').getAll()
          req.onsuccess = () => {
            resolve((req.result as Record<string, unknown>[]).filter((r) => r.campaignId === c))
            open.result.close()
          }
        }
      }),
    campaignId,
  )
}

function imageHasData(page: Page, imageId: string): Promise<boolean> {
  return page.evaluate(
    (id) =>
      new Promise<boolean>((resolve, reject) => {
        const open = indexedDB.open('dnd-codex')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result.transaction('images', 'readonly').objectStore('images').get(id)
          req.onsuccess = () => {
            resolve(String((req.result as { dataUrl?: string } | undefined)?.dataUrl ?? '').startsWith('data:image/'))
            open.result.close()
          }
        }
      }),
    imageId,
  )
}
