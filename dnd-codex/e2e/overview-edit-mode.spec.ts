import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { moveCard, stepSpan, hideCard, addCard, spansFor } from '../src/components/overview-edit/ops'
import { DEFAULT_LAYOUT, CARDS } from '../src/lib/overviewCards'

// Overview edit mode (T-89): the keyboard-and-buttons way to reorder, resize, hide and
// re-add cards. Saved through the same record as Phase B, so a reload keeps the result.

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __load: (path: string) => Promise<any>
  }
}

const DEFAULT_ORDER = ['World overview', 'Next session', 'Prep', 'Run', 'World & Lore', 'Reference', 'Recent sessions', 'Links and Voice', 'Prep checklist', 'Recently edited']

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__load = (p: string) => import(/* @vite-ignore */ p)
  })
})

async function createCampaign(page: Page): Promise<void> {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start a campaign' }).click()
  await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Edit ${Date.now()}`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
}

const editButton = (page: Page) => page.getByRole('button', { name: 'Edit layout' })
const startEditing = async (page: Page) => {
  await editButton(page).click()
  await expect(page.getByRole('region', { name: 'Editing layout' })).toBeVisible()
}
const toolbarNames = (page: Page) =>
  page.locator('.ov-edit-toolbar-name').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))
const live = (page: Page) => page.locator('.ov-edit-bar [aria-live="polite"]')
const storedIds = (page: Page) =>
  page.evaluate(async () => {
    const { db } = await window.__load('/src/db/db.ts')
    const rec = (await db.overviewLayout.toArray())[0]
    return rec ? { cards: rec.cards.map((c: { id: string; span: number }) => `${c.id}:${c.span}`), hidden: rec.hidden } : null
  })

test.describe('layout operations (pure)', () => {
  const ids = (l: { cards: { id: string }[] }) => l.cards.map((c) => c.id)
  test('move, width, hide and add change only what they should', () => {
    const l = DEFAULT_LAYOUT
    expect(moveCard(l, 'world', { by: -1 })).toBe(l) // already first
    expect(ids(moveCard(l, 'prep', { by: 1 })).slice(2, 4)).toEqual(['run', 'prep'])
    expect(ids(moveCard(l, 'prep', 'last')).at(-1)).toBe('prep')
    expect(ids(moveCard(l, 'recently-edited', 'first'))[0]).toBe('recently-edited')
    expect(stepSpan(l, 'world', 1)).toBe(l) // already full width
    expect(stepSpan(l, 'world', -1).cards[0].span).toBe(8)
    expect(stepSpan(stepSpan(l, 'world', -1), 'world', -1).cards[0].span).toBe(6)
    expect(stepSpan(stepSpan(stepSpan(l, 'world', -1), 'world', -1), 'world', -1).cards[0].span).toBe(6) // minSpan 6
    expect(spansFor('prep')).toEqual([4, 6, 8, 12])
    const h = hideCard(l, 'run')
    expect(ids(h)).not.toContain('run')
    expect(h.hidden).toEqual(['run'])
    const a = addCard(h, 'run')
    expect(ids(a).at(-1)).toBe('run')
    expect(a.cards.at(-1)!.span).toBe(6)
    expect(a.hidden).toEqual([])
    expect(CARDS.every((c) => spansFor(c.id).includes(c.defaultSpan))).toBe(true)
  })
})

test.describe('Overview edit mode (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('enter and leave: a labelled bar, toolbars on every card, inert card bodies, focus returns', async ({ page }) => {
    await createCampaign(page)
    await expect(page.locator('.ov-edit-toolbar')).toHaveCount(0)
    await startEditing(page)
    await expect(editButton(page)).toHaveAttribute('aria-pressed', 'true')
    expect(await toolbarNames(page)).toEqual(DEFAULT_ORDER)
    await expect(page.locator('.ov-card-body[inert]')).toHaveCount(10)
    // The bar takes focus; the cards' own controls are not reachable.
    await expect(page.locator('#ov-edit-title')).toBeFocused()
    await expect(page.locator('.ov-hubcard .ov-panel-toggle').first()).not.toBeEnabled().catch(() => {})
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.locator('.ov-edit-toolbar')).toHaveCount(0)
    await expect(page.locator('.ov-card-body[inert]')).toHaveCount(0)
    await expect(editButton(page)).toBeFocused()
    await expect(editButton(page)).toHaveAttribute('aria-pressed', 'false')
  })

  test('move a card with the keyboard: order, focus, announcement, and it survives a reload', async ({ page }) => {
    await createCampaign(page)
    await startEditing(page)
    const later = page.getByRole('button', { name: /^Move Prep later/ })
    await later.focus()
    await page.keyboard.press('ArrowRight')
    expect((await toolbarNames(page)).slice(2, 5)).toEqual(['Run', 'Prep', 'World & Lore'])
    await expect(live(page)).toContainText('Prep moved to position 4 of 10')
    await expect(page.getByRole('button', { name: /^Move Prep later/ })).toBeFocused()
    await page.keyboard.press('End')
    expect((await toolbarNames(page)).at(-1)).toBe('Prep')
    await expect.poll(async () => (await storedIds(page))?.cards.at(-1)).toBe('prep:6')

    await page.reload()
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)
    const titles = await page.locator('.ov-bento > .ov-cell').evaluateAll((els) => els.map((e) => (e.querySelector('h3')?.textContent ?? '').trim()))
    expect(titles.at(-1)).toBe('Prep')
    // Move buttons at the ends keep focus and say so, instead of dropping it.
    await startEditing(page)
    const first = page.getByRole('button', { name: /^Move World overview earlier/ })
    await first.focus()
    await first.press('Enter')
    await expect(first).toBeFocused()
    await expect(live(page)).toContainText('already first')
  })

  test('width steps by button and arrow key, within each card\'s limits', async ({ page }) => {
    await createCampaign(page)
    await startEditing(page)
    const span = (title: string) =>
      page.locator('.ov-cell', { hasText: title }).first().evaluate((e) => getComputedStyle(e).gridColumnStart)
    const cell = (name: string) => page.locator('.ov-cell').filter({ has: page.getByRole('group', { name: `${name} layout controls` }) })
    const wide = (name: string) => cell(name).evaluate((e) => getComputedStyle(e).gridColumnStart)
    expect(await wide('Recent sessions')).toBe('span 8')
    await page.getByRole('button', { name: /^Make Recent sessions wider/ }).click()
    expect(await wide('Recent sessions')).toBe('span 12')
    await expect(live(page)).toContainText('Recent sessions is now full width')
    const narrower = page.getByRole('button', { name: /^Make Recent sessions narrower/ })
    await narrower.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    expect(await wide('Recent sessions')).toBe('span 4') // one third is the narrowest
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('button', { name: /^Make Recent sessions narrower/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(live(page)).toContainText('already at its narrowest')
    // World overview never goes below half.
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: /^Make World overview narrower/ }).click()
    expect(await wide('World overview')).toBe('span 6')
    void span
    await expect.poll(async () => (await storedIds(page))?.cards.find((c: string) => c.startsWith('world:'))).toBe('world:6')
  })

  test('hide a card, add it back from the tray, and Reset with Undo', async ({ page }) => {
    await createCampaign(page)
    await startEditing(page)
    await page.getByRole('button', { name: 'Hide Prep', exact: true }).click()
    expect(await toolbarNames(page)).not.toContain('Prep')
    await expect(live(page)).toContainText('Prep hidden')
    // Focus moved to the next card's controls, not lost.
    await expect(page.getByRole('button', { name: /^Move Run earlier/ })).toBeFocused()
    await expect.poll(async () => (await storedIds(page))?.hidden).toEqual(['prep'])

    await page.getByRole('button', { name: /^Add card \(1\)/ }).click()
    await expect(page.locator('#ov-edit-tray')).toContainText('Last session recap')
    await page.getByRole('button', { name: 'Add Prep back' }).click()
    expect((await toolbarNames(page)).at(-1)).toBe('Prep')
    await expect(page.getByRole('button', { name: /^Move Prep earlier/ })).toBeFocused()

    // Reset, then Undo.
    await page.getByRole('button', { name: /^Move Prep earlier/ }).click()
    const before = await toolbarNames(page)
    await page.getByRole('button', { name: 'Reset layout' }).click()
    expect(await toolbarNames(page)).toEqual(DEFAULT_ORDER)
    await expect(page.getByRole('status').filter({ hasText: 'Layout reset' }).first()).toBeVisible()
    await expect.poll(() => storedIds(page)).toBeNull()
    await page.getByRole('button', { name: 'Undo' }).click()
    expect(await toolbarNames(page)).toEqual(before)
    await expect.poll(async () => (await storedIds(page))?.cards.length).toBe(10)
  })

  test('hiding every card never strands you: the tray stays open, and Reset or Edit layout recover', async ({ page }) => {
    await createCampaign(page)
    await startEditing(page)
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: /^Hide / }).first().click()
    await expect(page.locator('.ov-edit-toolbar')).toHaveCount(0)
    await expect(page.locator('#ov-edit-tray')).toBeVisible()
    await expect(page.locator('#ov-edit-tray')).toContainText('Every card is hidden')
    await page.getByRole('button', { name: 'Add World overview back' }).click()
    await expect(page.locator('.ov-edit-toolbar')).toHaveCount(1)
    await page.getByRole('button', { name: /^Hide World overview/ }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    // Outside edit mode the page offers the way back.
    const empty = page.getByRole('region', { name: 'All cards hidden' })
    await expect(empty).toBeVisible()
    await empty.getByRole('button', { name: 'Edit layout' }).click()
    await expect(page.getByRole('region', { name: 'Editing layout' })).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()
    await empty.getByRole('button', { name: 'Reset layout' }).click()
    await expect(page.locator('.ov-bento > .ov-cell')).toHaveCount(10)
  })

  test('Tab order equals visual order after edits, in edit mode and after Done', async ({ page }) => {
    await createCampaign(page)
    await startEditing(page)
    await page.getByRole('button', { name: /^Make Run wider/ }).click() // 12: Run now has its own row
    await page.getByRole('button', { name: /^Move Recent sessions earlier/ }).click()
    await page.getByRole('button', { name: /^Move Recent sessions earlier/ }).click()
    const expected = await toolbarNames(page)
    const seen: string[] = []
    await page.locator('#ov-edit-title').focus()
    for (let i = 0; i < 80 && seen.length < expected.length; i++) {
      await page.keyboard.press('Tab')
      const t = await page.evaluate(() => document.activeElement?.closest('.ov-edit-toolbar')?.querySelector('.ov-edit-toolbar-name')?.textContent ?? '')
      if (t && !seen.includes(t)) seen.push(t)
    }
    expect(seen).toEqual(expected)
    // Visual order is row-major in the same list.
    const pos = await page.locator('.ov-bento > .ov-cell').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.y, r.x] }))
    for (let i = 1; i < pos.length; i++) {
      const sameRow = Math.abs(pos[i][0] - pos[i - 1][0]) < 2
      expect(sameRow ? pos[i][1] > pos[i - 1][1] : pos[i][0] > pos[i - 1][0]).toBe(true)
    }
    // Cards in a row are still equal height: the edit controls do not trigger the collapse rule.
    const refc = (await page.locator('.ov-cell').filter({ has: page.getByRole('group', { name: 'Reference layout controls' }) }).boundingBox())!
    const lore = (await page.locator('.ov-cell').filter({ has: page.getByRole('group', { name: 'World & Lore layout controls' }) }).boundingBox())!
    expect(Math.abs(refc.height - lore.height)).toBeLessThan(2)
  })

  test('the World overview editor is not remounted by edit mode or by moving it', async ({ page }) => {
    await createCampaign(page)
    await page.evaluate(async () => {
      const repo = await window.__load('/src/db/repo.ts')
      await repo.updateCampaign(location.hash.split('/')[2], { description: '<p>Hello world</p>' })
    })
    await page.reload()
    await expect(page.locator('.ov-world')).toContainText('Hello world')
    await page.locator('.ov-world').evaluate((el) => el.setAttribute('data-marker', 'same-node'))
    await startEditing(page)
    await page.getByRole('button', { name: /^Move World overview later/ }).click()
    await page.getByRole('button', { name: /^Move World overview later/ }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.locator('.ov-world')).toHaveAttribute('data-marker', 'same-node')
  })
})

test.describe('Overview edit mode (phone and tablet)', () => {
  for (const [w, name] of [[375, 'phone'], [800, 'tablet']] as const) {
    test(`${name}: reorder and hide only, no width controls, 44px targets, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 })
      await createCampaign(page)
      await startEditing(page)
      await expect(page.getByRole('button', { name: /^Make .* (wider|narrower)/ })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^Move Prep later/ })).toBeVisible()
      const box = (await page.getByRole('button', { name: /^Move Prep later/ }).boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(43.5)
      expect(box.width).toBeGreaterThanOrEqual(43.5)
      await page.getByRole('button', { name: /^Move Prep later/ }).click()
      expect((await toolbarNames(page)).slice(2, 4)).toEqual(['Run', 'Prep'])
      await page.getByRole('button', { name: 'Hide Run', exact: true }).click()
      expect(await toolbarNames(page)).not.toContain('Run')
      const overflow = await page.evaluate(() => { const el = document.querySelector('.main') as HTMLElement; return el.scrollWidth - el.clientWidth })
      expect(overflow).toBeLessThanOrEqual(0)
      // Tab order in edit mode equals the DOM (and, on one column, the visual) order.
      const expected = await toolbarNames(page)
      const seen: string[] = []
      await page.locator('#ov-edit-title').focus()
      for (let i = 0; i < 90 && seen.length < expected.length; i++) {
        await page.keyboard.press('Tab')
        const t = await page.evaluate(() => document.activeElement?.closest('.ov-edit-toolbar')?.querySelector('.ov-edit-toolbar-name')?.textContent ?? '')
        if (t && !seen.includes(t)) seen.push(t)
      }
      expect(seen).toEqual(expected)
    })
  }
})

test.describe('Overview edit mode (demo)', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })
  test('edits last for the page view only and never touch Supabase', async ({ page, supabaseRequests }) => {
    await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
    await page.goto('/#/campaign/demo-campaign-0001')
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)
    await startEditing(page)
    await page.getByRole('button', { name: 'Hide Run', exact: true }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.locator('.ov-hubcard')).toHaveCount(3)
    expect(await storedIds(page)).toBeNull() // nothing saved
    await page.reload()
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)
    expect(supabaseRequests).toEqual([])
  })
})
