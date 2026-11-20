import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// The campaign shell: the page tree in the sidebar (and phone drawer), its
// collapsed-by-default groups with open/close motion (T-68), the breadcrumb
// header, and the Overview at phone width. Local-first, signed out, no backend.

async function createCampaign(page: Page): Promise<string> {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start a campaign' }).click()
  await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Shell ${Date.now()}`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
  return new URL(page.url()).hash.split('/')[2]
}

const GROUPS = ['Prep', 'Run', 'World', 'Reference']

test.describe('campaign page tree (desktop)', () => {
  test('groups start collapsed, open on click, and the choice survives a reload', async ({ page }) => {
    await createCampaign(page)
    const tree = page.locator('.ctree')

    for (const g of GROUPS) {
      await expect(tree.getByRole('button', { name: g })).toHaveAttribute('aria-expanded', 'false')
    }
    // Collapsed links are hidden, so they can't be reached by mouse or keyboard.
    await expect(tree.getByRole('link', { name: 'Sessions' })).toBeHidden()
    await expect(tree.getByRole('link', { name: 'NPCs' })).toBeHidden()

    await tree.getByRole('button', { name: 'Prep' }).click()
    await expect(tree.getByRole('button', { name: 'Prep' })).toHaveAttribute('aria-expanded', 'true')
    await expect(tree.getByRole('link', { name: 'Sessions' })).toBeVisible()
    // Other groups stay closed.
    await expect(tree.getByRole('link', { name: 'NPCs' })).toBeHidden()

    // Persisted per browser: still open after a reload, others still closed.
    await page.reload()
    await expect(tree.getByRole('button', { name: 'Prep' })).toHaveAttribute('aria-expanded', 'true')
    await expect(tree.getByRole('link', { name: 'Sessions' })).toBeVisible()
    await expect(tree.getByRole('button', { name: 'World' })).toHaveAttribute('aria-expanded', 'false')

    // Closing is remembered too.
    await tree.getByRole('button', { name: 'Prep' }).click()
    await expect(tree.getByRole('link', { name: 'Sessions' })).toBeHidden()
    await page.reload()
    await expect(tree.getByRole('button', { name: 'Prep' })).toHaveAttribute('aria-expanded', 'false')
  })

  test('opening animates the height; reduced motion switches instantly', async ({ page }) => {
    await createCampaign(page)
    const panel = page.locator('#ctree-panel-world')
    const duration = () => panel.evaluate((el) => getComputedStyle(el).transitionDuration)

    await page.locator('.ctree').getByRole('button', { name: 'World' }).click()
    // Opening uses the dialog entrance timing (180ms) on the row height.
    expect(await duration()).toContain('0.18s')
    await expect(panel).toHaveCSS('grid-template-rows', /\d/)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await duration()).toBe('0s')
  })

  test('keyboard: a group toggles with Enter and closed links are not tabbable', async ({ page }) => {
    await createCampaign(page)
    const tree = page.locator('.ctree')
    const world = tree.getByRole('button', { name: 'World' })

    await world.focus()
    await page.keyboard.press('Enter')
    await expect(world).toHaveAttribute('aria-expanded', 'true')
    // The toggle controls the panel it opens.
    await expect(world).toHaveAttribute('aria-controls', 'ctree-panel-world')

    // Tab from the open World toggle lands on its first link.
    await page.keyboard.press('Tab')
    await expect(tree.getByRole('link', { name: 'World notes' })).toBeFocused()

    await world.focus()
    await page.keyboard.press('Space')
    await expect(world).toHaveAttribute('aria-expanded', 'false')
    // Wait for the close transition to finish; the links leave the tab order then.
    await expect(tree.getByRole('link', { name: 'World notes' })).toBeHidden()
    await page.keyboard.press('Tab')
    // World is closed, so focus skips its seven links and moves to the next group toggle.
    await expect(tree.getByRole('button', { name: 'Reference' })).toBeFocused()
  })

  test('the group holding the current page is marked, and the breadcrumb names the page', async ({ page }) => {
    const id = await createCampaign(page)
    await page.goto(`/#/campaign/${id}/npcs`)
    await expect(page.locator('.ctree').getByRole('button', { name: 'World' })).toHaveClass(/has-active/)
    await expect(page.locator('.ctree').getByRole('button', { name: 'Prep' })).not.toHaveClass(/has-active/)
    const crumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(crumb).toContainText('NPCs')
    await expect(crumb.getByRole('link', { name: /All campaigns/ })).toBeVisible()
  })

  test('a deep link opens only the group that holds the page, and keeps other stored choices', async ({ page }) => {
    const id = await createCampaign(page)
    const tree = page.locator('.ctree')

    // Deep link straight to NPCs: World is open and its link is visible; the rest stay closed.
    await page.goto(`/#/campaign/${id}/npcs`)
    await page.reload()
    await expect(tree.getByRole('button', { name: 'World' })).toHaveAttribute('aria-expanded', 'true')
    await expect(tree.getByRole('link', { name: 'NPCs' })).toBeVisible()
    for (const g of ['Prep', 'Run', 'Reference']) {
      await expect(tree.getByRole('button', { name: g })).toHaveAttribute('aria-expanded', 'false')
    }

    // The automatic open is not stored: a reload on the Overview closes World again.
    await page.goto(`/#/campaign/${id}`)
    await page.reload()
    await expect(tree.getByRole('button', { name: 'World' })).toHaveAttribute('aria-expanded', 'false')

    // A stored choice for another group survives a deep link into a different group.
    await tree.getByRole('button', { name: 'Prep' }).click()
    await page.goto(`/#/campaign/${id}/items`)
    await page.reload()
    await expect(tree.getByRole('button', { name: 'Reference' })).toHaveAttribute('aria-expanded', 'true')
    await expect(tree.getByRole('button', { name: 'Prep' })).toHaveAttribute('aria-expanded', 'true')
    await expect(tree.getByRole('button', { name: 'World' })).toHaveAttribute('aria-expanded', 'false')
  })

  test('moving to a page in a closed group opens that group; closing it by hand sticks until the route changes', async ({ page }) => {
    const id = await createCampaign(page)
    const tree = page.locator('.ctree')
    await expect(tree.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-expanded', 'false')

    // A jump from elsewhere (search, a backlink chip) is a route change.
    await page.evaluate((cid) => { location.hash = `#/campaign/${cid}/battlemap` }, id)
    await expect(tree.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-expanded', 'true')
    await expect(tree.getByRole('link', { name: 'Battle Map' })).toBeVisible()

    // Closing the active group by hand sticks while the route stays put.
    await tree.getByRole('button', { name: 'Run' }).click()
    await expect(tree.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-expanded', 'false')
    await page.waitForTimeout(300)
    await expect(tree.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-expanded', 'false')
  })

  test('light theme keeps the tree and Overview readable', async ({ page }) => {
    await createCampaign(page)
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
    const head = page.locator('.ctree-head')
    await expect(head).toBeVisible()
    const [fg, bg] = await head.evaluate((el) => [
      getComputedStyle(el).color,
      getComputedStyle(document.body).backgroundColor,
    ])
    expect(fg).not.toBe(bg)
    await expect(page.locator('.ov-hero h1')).toBeVisible()
  })
})

test.describe('campaign page tree (phone drawer)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('drawer tree starts collapsed, expands, and closes on navigation', async ({ page }) => {
    await createCampaign(page)
    await page.getByRole('button', { name: 'Open menu' }).click()
    const tree = page.locator('.sidebar .ctree')
    await expect(tree.getByRole('button', { name: 'World' })).toHaveAttribute('aria-expanded', 'false')
    await expect(tree.getByRole('link', { name: 'NPCs' })).toBeHidden()

    await tree.getByRole('button', { name: 'World' }).click()
    await expect(tree.getByRole('link', { name: 'NPCs' })).toBeVisible()
    await tree.getByRole('link', { name: 'NPCs' }).click()
    await expect(page).toHaveURL(/\/npcs$/)
    // The drawer closes after a link tap.
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible()
  })

  test('Overview does not scroll sideways at 375px', async ({ page }) => {
    await createCampaign(page)
    await expect(page.locator('.ov-hero')).toBeVisible()
    await expect(page.locator('.ov-stats .ov-stat')).toHaveCount(6)
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('.main') as HTMLElement
      return main.scrollWidth - main.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
