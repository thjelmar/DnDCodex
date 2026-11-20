import { test, expect } from './fixtures'

// The Overview prep checklist and recently-edited feed on a real page (T-70).
// Local-first and signed out. Demo mode makes no cloud requests; the existing
// demo-isolation spec covers the Overview, which now includes these panels.

test('a new campaign shows an unticked checklist and an empty feed, then the feed picks up an edit', async ({ page }) => {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start a campaign' }).click()
  await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Prep ${Date.now()}`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/#\/campaign\/[^/]+/)

  const prep = page.getByRole('region', { name: 'Prep checklist' })
  await expect(prep).toContainText('0 of 3 done')
  await expect(prep.getByRole('link', { name: /Schedule the next session/ })).toBeVisible()
  await expect(prep.getByRole('link', { name: /Log your first session/ })).toBeVisible()
  await expect(prep.getByRole('link', { name: /Write the world overview/ })).toBeVisible()

  // Placement: both panels sit in the main column under Recent sessions, and the
  // World overview stays first.
  const top = async (name: string) =>
    (await page.getByRole('heading', { name }).boundingBox())!.y
  const ys = [await top('World overview'), await top('Recent sessions'), await top('Prep checklist'), await top('Recently edited')]
  expect(ys).toEqual([...ys].sort((a, b) => a - b))

  // The world overview item opens the Edit campaign dialog.
  await prep.getByRole('link', { name: /Write the world overview/ }).click()
  await expect(page.getByRole('dialog', { name: 'Edit Campaign' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit Campaign' })).toBeHidden()
  await expect(page).toHaveURL(/#\/campaign\/[^/?]+$/)

  const feed = page.getByRole('region', { name: 'Recently edited' })
  await expect(feed).toContainText('Nothing yet')

  // Add a session: the checklist now asks for its recap, and the feed lists it.
  // Navigate by URL: the sidebar's Prep group may be collapsed (#137), so a click on
  // its Sessions link would depend on which branch this runs on.
  const campaignId = new URL(page.url()).hash.split('/')[2]
  await page.goto(`/#/campaign/${campaignId}/sessions`)
  await page.getByRole('button', { name: 'New Session' }).click()
  await expect(page.getByText('Session 1').first()).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/#\/campaign\/[^/]+$/)

  await expect(prep.getByRole('link', { name: /Write the recap for Session 1/ })).toBeVisible()
  await expect(feed.getByRole('link', { name: /Session 1/ })).toBeVisible()
  await expect(feed).not.toContainText('Nothing yet')
})
