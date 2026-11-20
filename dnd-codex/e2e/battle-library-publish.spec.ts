import { test, expect } from '@playwright/test'
import {
  LIVE,
  createTestUser,
  deleteTestUser,
  signInPage,
  seedLibraryTemplate,
  removeLibraryTemplate,
  addPublisher,
  libraryObjects,
  libraryRows,
  libraryPublicUrl,
  restAs,
  type TestUser,
} from './live'

// Battle map library, publisher paths (T-77). Needs the local Supabase stack:
// `npm run e2e:live`. Each test makes a throwaway user and cleans up after itself.
type Page = import('@playwright/test').Page

function dbScene(page: Page, name: string): Promise<{ imageId: string }> {
  return page.evaluate(
    (n) =>
      new Promise<{ imageId: string }>((resolve, reject) => {
        const open = indexedDB.open('dnd-codex')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result.transaction('scenes', 'readonly').objectStore('scenes').getAll()
          req.onsuccess = () => {
            resolve((req.result as { name: string; imageId: string }[]).find((x) => x.name === n)!)
            open.result.close()
          }
        }
      }),
    name,
  )
}

function imageData(page: Page, imageId: string): Promise<boolean> {
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

test.describe('battle map library publishing (live backend)', () => {
  test.skip(!LIVE, 'Needs a local Supabase stack. Run `npm run e2e:live`. See e2e/README.md.')

  let user: TestUser
  const seeded: string[] = []
  const published: string[] = []
  test.afterEach(async () => {
    for (const id of [...seeded.splice(0), ...published.splice(0)]) await removeLibraryTemplate(id, [1, 2])
    if (user) await deleteTestUser(user)
  })

  /** Signs in, makes a campaign, and puts a map scene in it (copied from a seeded template). */
  async function setup(page: Page, asPublisher: boolean) {
    user = await createTestUser()
    if (asPublisher) await addPublisher(user.id)
    await signInPage(page, user)
    const title = `Source ${Date.now()}`
    seeded.push(await seedLibraryTemplate({ title, tags: ['source'] }))
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Start a campaign' }).click()
    await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Publish ${Date.now()}`)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
    const campaignId = new URL(page.url()).hash.split('/')[2]
    await page.goto(`/#/campaign/${campaignId}/battlemap`)
    await page.getByRole('button', { name: 'Browse library' }).click()
    await page.getByTestId('library-card').filter({ hasText: title }).click()
    await page.getByTestId('library-use').click()
    await expect(page.getByLabel('Battle map name')).toHaveValue(title)
    return { campaignId, title }
  }


  /** Folders that hold a published-style map file, so a test can compare before and after. */
  async function webpFolders(): Promise<string[]> {
    const out: string[] = []
    for (const f of await libraryObjects('')) if ((await libraryObjects(`${f}/v1`)).includes('map.webp')) out.push(f)
    return out.sort()
  }

  async function openPublish(page: Page) {
    await page.getByRole('button', { name: 'Publish to library' }).click()
    await expect(page.getByRole('dialog').or(page.locator('.modal'))).toBeVisible()
  }

  test('a non-publisher sees no publish or manage controls', async ({ page }) => {
    await setup(page, false)
    await expect(page.getByRole('button', { name: 'Publish to library' })).toHaveCount(0)
    await page.goto('/#/tools/battlemaps')
    await expect(page.getByRole('link', { name: 'Manage' })).toHaveCount(0)
    await page.goto('/#/tools/battlemaps/manage')
    await expect(page.getByTestId('library-manage-denied')).toBeVisible()
  })

  test('a publisher saves a draft, previews, publishes, versions, edits, and deletes', async ({ page }) => {
    const { campaignId } = await setup(page, true)
    const copyTitle = `Mine ${Date.now()}`
    await page.getByLabel('Battle map name').fill(copyTitle)

    // 1. Required fields and rules.
    await openPublish(page)
    await page.getByTestId('publish-submit').click()
    await expect(page.getByRole('alert')).toContainText('Confirm that you own this map')
    await page.getByTestId('publish-rights').check()
    await page.getByLabel('I made this map myself').uncheck()
    await expect(page.getByLabel(/Credit line/)).toHaveValue('')
    await page.getByTestId('publish-submit').click()
    await expect(page.getByRole('alert')).toContainText('credit line and a licence note')
    await page.getByLabel('I made this map myself').check()
    await expect(page.getByLabel(/Credit line/)).toHaveValue(/Original map by/)
    await expect(page.getByLabel(/Licence note/)).toHaveValue(/Original work/)
    await page.getByLabel('Title').fill(copyTitle)
    await page.getByLabel('Description').fill('A published test map.')
    await page.getByLabel(/Tags/).fill('Cave, cave, E2E-tag')

    // 2. Saves as a DRAFT: files exist, the public cannot read the row.
    await page.getByTestId('publish-submit').click()
    await expect(page.getByTestId('publish-note')).toContainText('Saved a draft')
    const rows = (await libraryRows()).filter((r) => r.title === copyTitle)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    const id = row.id as string
    published.push(id)
    expect(row).toMatchObject({ status: 'draft', version: 1, tags: ['cave', 'e2e-tag'], description: 'A published test map.' })
    expect(await libraryObjects(`${id}/v1`)).toEqual(expect.arrayContaining(['map.webp', 'thumb.webp']))
    expect((await fetch(libraryPublicUrl(row.map_path as string))).ok).toBe(true)
    expect(await (await restAs('anon', `/rest/v1/battle_map_templates?id=eq.${id}&select=id`)).json()).toEqual([])

    // 3. Manage: preview, then publish; now the public sees it.
    await page.goto('/#/tools/battlemaps/manage')
    const manageRow = page.getByTestId('manage-row').filter({ hasText: copyTitle })
    await expect(manageRow.getByTestId('manage-status')).toHaveText('draft')
    await manageRow.getByRole('button', { name: 'Preview' }).click()
    await expect(page.getByAltText(`Full size ${copyTitle}`)).toBeVisible()
    await page.keyboard.press('Escape')
    await manageRow.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(manageRow.getByTestId('manage-status')).toHaveText('published')
    expect(await (await restAs('anon', `/rest/v1/battle_map_templates?id=eq.${id}&select=id`)).json()).toHaveLength(1)

    // 4. Edit details.
    await manageRow.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Title').fill(`${copyTitle} (edited)`)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByTestId('manage-row').filter({ hasText: `${copyTitle} (edited)` })).toBeVisible()

    // 5. Another campaign copy of v1, then a new version: v2 folder, v1 folder removed,
    //    and the earlier copy still has its image.
    const editedTitle = `${copyTitle} (edited)`
    await page.goto(`/#/campaign/${campaignId}/battlemap`)
    await page.getByRole('button', { name: 'Browse library' }).click()
    await page.getByTestId('library-card').filter({ hasText: editedTitle }).click()
    await page.getByTestId('library-use').click()
    await expect(page.getByLabel('Battle map name')).toHaveValue(editedTitle)
    const earlier = await dbScene(page, editedTitle)
    expect(await imageData(page, earlier.imageId)).toBe(true)

    await page.getByLabel('Switch battle map').selectOption({ label: copyTitle })
    await expect(page.getByLabel('Battle map name')).toHaveValue(copyTitle)
    await openPublish(page)
    await page.getByTestId('publish-target').selectOption({ label: `New version of: ${editedTitle} (v1)` })
    await page.getByTestId('publish-rights').check()
    await page.getByTestId('publish-submit').click()
    await expect(page.getByTestId('publish-note')).toContainText('Saved v2')
    const v2 = (await libraryRows(id))[0]
    expect(v2).toMatchObject({ version: 2, status: 'published', map_path: `${id}/v2/map.webp` })
    expect(await libraryObjects(`${id}/v2`)).toEqual(expect.arrayContaining(['map.webp', 'thumb.webp']))
    expect(await libraryObjects(`${id}/v1`)).toEqual([])
    expect((await fetch(libraryPublicUrl(`${id}/v2/map.webp`))).ok).toBe(true)
    expect(await imageData(page, earlier.imageId)).toBe(true)
    await page.reload()
    await page.getByText(editedTitle, { exact: true }).click()
    await expect(page.getByLabel('Battle map name')).toHaveValue(editedTitle)

    // 6. Archive hides it from the public; Delete removes row and files.
    await page.goto('/#/tools/battlemaps/manage')
    const r2 = page.getByTestId('manage-row').filter({ hasText: `${copyTitle} (edited)` })
    await r2.getByRole('button', { name: 'Archive' }).click()
    await expect(r2.getByTestId('manage-status')).toHaveText('archived')
    expect(await (await restAs('anon', `/rest/v1/battle_map_templates?id=eq.${id}&select=id`)).json()).toEqual([])
    await r2.getByRole('button', { name: 'Delete' }).click()
    await page.locator('.modal').getByRole('button', { name: 'Delete', exact: true }).click()
    await expect.poll(async () => (await libraryRows(id)).length).toBe(0)
    await expect.poll(async () => (await libraryObjects(`${id}/v2`)).length).toBe(0)
  })

  test('a failed thumbnail upload leaves nothing behind', async ({ page }) => {
    await setup(page, true)
    const t = `Fail ${Date.now()}`
    await page.getByLabel('Battle map name').fill(t)
    const before = await webpFolders()
    await page.route('**/storage/v1/object/battlemap-library/**/thumb.webp', (r) => r.abort())
    await openPublish(page)
    await page.getByTestId('publish-rights').check()
    await page.getByTestId('publish-submit').click()
    await expect(page.getByRole('alert')).toContainText('Thumbnail upload failed')
    expect((await libraryRows()).filter((r) => r.title === t)).toHaveLength(0)
    // The map file that did upload was removed again.
    expect(await webpFolders()).toEqual(before)
  })

  test('a failed save removes the uploaded files', async ({ page }) => {
    await setup(page, true)
    const t = `Fail2 ${Date.now()}`
    await page.getByLabel('Battle map name').fill(t)
    const before = await webpFolders()
    await page.route('**/rest/v1/battle_map_templates*', (r) =>
      r.request().method() === 'POST' ? r.fulfill({ status: 500, body: '{"message":"boom"}', contentType: 'application/json' }) : r.continue(),
    )
    await openPublish(page)
    await page.getByTestId('publish-rights').check()
    await page.getByTestId('publish-submit').click()
    await expect(page.getByRole('alert')).toContainText('Nothing was published')
    expect((await libraryRows()).filter((r) => r.title === t)).toHaveLength(0)
    expect(await webpFolders()).toEqual(before)
  })
})
