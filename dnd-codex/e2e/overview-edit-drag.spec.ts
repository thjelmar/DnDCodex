import { test, expect } from './fixtures'
import type { Page, Locator } from '@playwright/test'
import { columnWidth, dropTarget, indicatorBox, snapSpan, type CellRect } from '../src/components/overview-edit/dragMath'
import { setSpan } from '../src/components/overview-edit/ops'
import { DEFAULT_LAYOUT } from '../src/lib/overviewCards'

// Pointer drag and the resize handle in Overview edit mode (T-90). The buttons stay the
// primary path (covered in overview-edit-mode.spec.ts); these tests cover the mouse.

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __load: (path: string) => Promise<any>
  }
}

const DEFAULT_ORDER = ['World overview', 'Next session', 'Prep', 'Run', 'World & Lore', 'Reference', 'Recent sessions', 'Links and Voice', 'Prep checklist', 'Recently edited']

test.describe('drag and snap maths (pure)', () => {
  const cell = (id: string, x: number, y: number, w: number, h = 100): CellRect => ({ id, x, y, w, h })
  const row = [cell('a', 0, 0, 500), cell('b', 514, 0, 500), cell('c', 0, 114, 1014)]

  test('drop target: left half is before, right half is after, a full-width card splits top and bottom', () => {
    expect(dropTarget(row, 100, 50, 1014)).toMatchObject({ refId: 'a', before: true, index: 0, fullRow: false })
    expect(dropTarget(row, 400, 50, 1014)).toMatchObject({ refId: 'a', before: false, index: 1 })
    expect(dropTarget(row, 700, 50, 1014)).toMatchObject({ refId: 'b', before: true, index: 1 })
    expect(dropTarget(row, 900, 50, 1014)).toMatchObject({ refId: 'b', before: false, index: 2 })
    expect(dropTarget(row, 500, 130, 1014)).toMatchObject({ refId: 'c', before: true, fullRow: true, index: 2 })
    expect(dropTarget(row, 500, 200, 1014)).toMatchObject({ refId: 'c', before: false, index: 3 })
  })
  test('drop target: outside every card picks the nearest, and an empty list drops at the start', () => {
    expect(dropTarget(row, 2000, 5, 1014)).toMatchObject({ refId: 'b', before: false, index: 2 })
    expect(dropTarget(row, -50, -50, 1014)).toMatchObject({ refId: 'a', before: true, index: 0 })
    expect(dropTarget([], 10, 10, 1014)).toMatchObject({ index: 0, refId: null })
  })
  test('indicator sits in the gap beside, above or below the reference card', () => {
    expect(indicatorBox(row[0], { before: true, fullRow: false })).toEqual({ x: -9, y: 0, w: 4, h: 100 })
    expect(indicatorBox(row[0], { before: false, fullRow: false })).toEqual({ x: 505, y: 0, w: 4, h: 100 })
    expect(indicatorBox(row[2], { before: true, fullRow: true })).toEqual({ x: 0, y: 105, w: 1014, h: 4 })
    expect(indicatorBox(row[2], { before: false, fullRow: true })).toEqual({ x: 0, y: 219, w: 1014, h: 4 })
  })
  test('snapSpan picks the nearest allowed width, ties go narrower, and never goes below the allowed set', () => {
    const gap = 14
    const colW = columnWidth(1114, gap) // 80 px columns
    expect(colW).toBe(80)
    const at = (cols: number) => cols * colW + (cols - 1) * gap
    expect(snapSpan(at(4), colW, gap, [4, 6, 8, 12])).toBe(4)
    expect(snapSpan(at(5.5), colW, gap, [4, 6, 8, 12])).toBe(6)
    expect(snapSpan(at(7), colW, gap, [4, 6, 8, 12])).toBe(6) // tie between 6 and 8: narrower
    expect(snapSpan(at(10), colW, gap, [4, 6, 8, 12])).toBe(8) // tie between 8 and 12: narrower
    expect(snapSpan(at(11), colW, gap, [4, 6, 8, 12])).toBe(12)
    expect(snapSpan(5, colW, gap, [6, 8, 12])).toBe(6) // a card with a half-width minimum
    expect(snapSpan(5000, colW, gap, [4, 6, 8, 12])).toBe(12)
  })
  test('setSpan snaps to an allowed step and respects the card minimum', () => {
    expect(setSpan(DEFAULT_LAYOUT, 'world', 4).cards[0].span).toBe(6)
    expect(setSpan(DEFAULT_LAYOUT, 'recent-sessions', 12).cards.find((c) => c.id === 'recent-sessions')!.span).toBe(12)
    expect(setSpan(DEFAULT_LAYOUT, 'recent-sessions', 8)).toBe(DEFAULT_LAYOUT)
  })
})

async function createCampaign(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__load = (p: string) => import(/* @vite-ignore */ p)
  })
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start a campaign' }).click()
  await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Drag ${Date.now()}`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
}
async function edit(page: Page) {
  await page.getByRole('button', { name: 'Edit layout' }).click()
  await expect(page.getByRole('region', { name: 'Editing layout' })).toBeVisible()
}
const titles = (page: Page) =>
  page.locator('.ov-edit-toolbar-name').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))
const grip = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^Drag ${name.replace(/[&]/g, '\\&')} to a new place`) })
const resizer = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^Resize ${name.replace(/[&]/g, '\\&')},`) })
const cellOf = (page: Page, name: string) =>
  page.locator('.ov-cell').filter({ has: page.getByRole('group', { name: `${name} layout controls` }) })
const centre = async (l: Locator) => {
  const b = (await l.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }
}
const span = (page: Page, name: string) => cellOf(page, name).evaluate((e) => getComputedStyle(e).gridColumnStart)
const live = (page: Page) => page.locator('.ov-edit-bar [aria-live="polite"]')
const stored = (page: Page) =>
  page.evaluate(async () => {
    const { db } = await window.__load('/src/db/db.ts')
    const r = (await db.overviewLayout.toArray())[0]
    return r ? r.cards.map((c: { id: string; span: number }) => `${c.id}:${c.span}`) : null
  })

test.describe('pointer drag (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 2600 } }) // tall, so every card is on screen

  test('drag a card above another: indicator while dragging, new order on drop, saved, Tab order intact', async ({ page }) => {
    await createCampaign(page)
    await edit(page)
    const from = await centre(grip(page, 'Reference'))
    const world = (await cellOf(page, 'World overview').boundingBox())!
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(world.x + 200, world.y + 10, { steps: 10 })
    await expect(page.locator('.ov-drop-indicator')).toBeVisible()
    await expect(page.locator('.ov-drag-ghost')).toContainText('Moving Reference')
    await expect(cellOf(page, 'Reference')).toHaveClass(/is-dragging/)
    expect(await titles(page)).toEqual(DEFAULT_ORDER) // nothing moves until the drop
    await page.mouse.up()
    await expect(page.locator('.ov-drop-indicator')).toHaveCount(0)
    await expect(page.locator('.ov-drag-ghost')).toHaveCount(0)
    await expect(page.locator('body')).not.toHaveClass(/ov-dragging/)
    expect((await titles(page))[0]).toBe('Reference')
    await expect(live(page)).toContainText('Reference moved to position 1 of 10')
    await expect(grip(page, 'Reference')).toBeFocused()
    await expect.poll(async () => (await stored(page))?.[0]).toBe('reference:6')

    // Visual order is row-major in the same list, so Tab order (the DOM order) matches it.
    const pos = await page.locator('.ov-bento > .ov-cell').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.y, r.x] }))
    for (let i = 1; i < pos.length; i++) {
      const sameRow = Math.abs(pos[i][0] - pos[i - 1][0]) < 2
      expect(sameRow ? pos[i][1] > pos[i - 1][1] : pos[i][0] > pos[i - 1][0]).toBe(true)
    }
    const expected = await titles(page)
    const seen: string[] = []
    await page.locator('#ov-edit-title').focus()
    for (let i = 0; i < 80 && seen.length < expected.length; i++) {
      await page.keyboard.press('Tab')
      const t = await page.evaluate(() => document.activeElement?.closest('.ov-edit-toolbar')?.querySelector('.ov-edit-toolbar-name')?.textContent ?? '')
      if (t && !seen.includes(t)) seen.push(t)
    }
    expect(seen).toEqual(expected)

    await page.reload()
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)
    const first = await page.locator('.ov-bento > .ov-cell').first().locator('h3').first().textContent()
    expect(first?.trim()).toBe('Reference')
  })

  test('dropping beside a card puts the dragged card in that row, and the row stays equal height', async ({ page }) => {
    await createCampaign(page)
    await edit(page)
    // Drag World & Lore onto the left half of Run: the rows become Prep + Lore, then Run + Reference.
    const from = await centre(grip(page, 'World & Lore'))
    const run = (await cellOf(page, 'Run').boundingBox())!
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(run.x + 30, run.y + run.height / 2, { steps: 12 })
    await page.mouse.up()
    expect((await titles(page)).slice(2, 6)).toEqual(['Prep', 'World & Lore', 'Run', 'Reference'])
    // Prep and Lore now share a row at equal height: the rows reflowed without a jump or a collapse.
    const a = (await cellOf(page, 'Prep').boundingBox())!
    const b = (await cellOf(page, 'World & Lore').boundingBox())!
    expect(Math.abs(a.y - b.y)).toBeLessThan(2)
    expect(Math.abs(a.height - b.height)).toBeLessThan(2)
  })

  test('Escape cancels a drag: nothing moves, the ghost and indicator go away', async ({ page }) => {
    await createCampaign(page)
    await edit(page)
    const from = await centre(grip(page, 'Reference'))
    const world = (await cellOf(page, 'World overview').boundingBox())!
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(world.x + 200, world.y + 10, { steps: 6 })
    await expect(page.locator('.ov-drop-indicator')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.ov-drop-indicator')).toHaveCount(0)
    await expect(page.locator('.ov-drag-ghost')).toHaveCount(0)
    await expect(cellOf(page, 'Reference')).not.toHaveClass(/is-dragging/)
    await expect(live(page)).toContainText('Move cancelled')
    await page.mouse.up()
    expect(await titles(page)).toEqual(DEFAULT_ORDER)
    expect(await stored(page)).toBeNull()
    // Edit mode is not stuck: a normal drag still works afterwards.
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(world.x + 200, world.y + 10, { steps: 6 })
    await page.mouse.up()
    expect((await titles(page))[0]).toBe('Reference')
  })

  test('a drag ends cleanly on pointercancel and on window blur, and a drop that is not over a change does nothing', async ({ page }) => {
    await createCampaign(page)
    await edit(page)
    const from = await centre(grip(page, 'Reference'))
    const world = (await cellOf(page, 'World overview').boundingBox())!
    for (const how of ['pointercancel', 'blur'] as const) {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(world.x + 200, world.y + 10, { steps: 6 })
      await expect(page.locator('.ov-drag-ghost')).toBeVisible()
      await page.evaluate((h) => {
        if (h === 'blur') window.dispatchEvent(new Event('blur'))
        else document.querySelector('.ov-edit-grip[aria-label^="Drag Reference"]')!.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }))
      }, how)
      await expect(page.locator('.ov-drag-ghost')).toHaveCount(0)
      await expect(page.locator('body')).not.toHaveClass(/ov-dragging/)
      await page.mouse.up()
      expect(await titles(page)).toEqual(DEFAULT_ORDER)
    }
    // Dropping a card back where it started changes nothing and saves nothing.
    const c = await centre(grip(page, 'Prep'))
    await page.mouse.move(c.x, c.y)
    await page.mouse.down()
    await page.mouse.move(c.x + 20, c.y + 5, { steps: 4 })
    await page.mouse.up()
    expect(await titles(page)).toEqual(DEFAULT_ORDER)
    expect(await stored(page)).toBeNull()
  })

  test('leaving edit mode during a drag ends it', async ({ page }) => {
    await createCampaign(page)
    await edit(page)
    const from = await centre(grip(page, 'Reference'))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 40, from.y - 100, { steps: 4 })
    await page.evaluate(() => (document.querySelector('.ov-edit-bar .btn.primary') as HTMLElement).click()) // Done
    await expect(page.locator('.ov-drag-ghost')).toHaveCount(0)
    await expect(page.locator('body')).not.toHaveClass(/ov-dragging/)
    await page.mouse.up()
  })

  test('the page scrolls while a card is dragged near its bottom edge', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 })
    await createCampaign(page)
    await edit(page)
    const from = await centre(grip(page, 'Next session'))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 10, 690, { steps: 6 })
    await expect.poll(() => page.evaluate(() => (document.querySelector('.main') as HTMLElement).scrollTop), { timeout: 5000 }).toBeGreaterThan(40)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    expect((await titles(page))[1]).toBe('Next session')
  })

  test('the World overview editor is not remounted by a drag', async ({ page }) => {
    await createCampaign(page)
    await page.evaluate(async () => {
      const repo = await window.__load('/src/db/repo.ts')
      await repo.updateCampaign(location.hash.split('/')[2], { description: '<p>Hello world</p>' })
    })
    await page.reload()
    await expect(page.locator('.ov-world')).toContainText('Hello world')
    await page.locator('.ov-world').evaluate((el) => el.setAttribute('data-marker', 'same-node'))
    await edit(page)
    const from = await centre(grip(page, 'World overview'))
    const recent = (await cellOf(page, 'Recent sessions').boundingBox())!
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(recent.x + 20, recent.y + recent.height - 10, { steps: 12 })
    await page.mouse.up()
    expect((await titles(page)).indexOf('World overview')).toBeGreaterThan(3)
    await expect(page.locator('.ov-world')).toHaveAttribute('data-marker', 'same-node')
  })
})

test.describe('resize handle (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 2600 } }) // tall, so every card is on screen

  /** Page x of the right edge of a card that is `cols` columns wide, starting at the grid's left edge. */
  async function edgeFor(page: Page, name: string, cols: number) {
    const grid = (await page.locator('.ov-bento').boundingBox())!
    const cell = (await cellOf(page, name).boundingBox())!
    const gap = 14
    const colW = (grid.width - gap * 11) / 12
    return cell.x + cols * colW + (cols - 1) * gap
  }

  test('dragging the edge snaps to the allowed widths, shows a preview, and saves on release', async ({ page }) => {
    await createCampaign(page)
    await edit(page)
    const h = await centre(resizer(page, 'Recent sessions'))
    await expect.poll(() => span(page, 'Recent sessions')).toBe('span 8')
    await page.mouse.move(h.x, h.y)
    await page.mouse.down()
    await page.mouse.move(await edgeFor(page, 'Recent sessions', 12), h.y, { steps: 8 })
    await expect.poll(() => span(page, 'Recent sessions')).toBe('span 12')
    await expect(page.locator('.ov-drag-ghost')).toContainText('Recent sessions: full width')
    await expect(cellOf(page, 'Recent sessions')).toHaveClass(/is-resizing/)
    await page.mouse.move(await edgeFor(page, 'Recent sessions', 4), h.y, { steps: 8 })
    await expect.poll(() => span(page, 'Recent sessions')).toBe('span 4')
    await page.mouse.move(await edgeFor(page, 'Recent sessions', 6.6), h.y, { steps: 6 })
    await expect.poll(() => span(page, 'Recent sessions')).toBe('span 6')
    await page.mouse.up()
    await expect.poll(() => span(page, 'Recent sessions')).toBe('span 6')
    await expect(page.locator('.ov-drag-ghost')).toHaveCount(0)
    await expect(live(page)).toContainText('Recent sessions is now half')
    await expect.poll(async () => (await stored(page))?.find((c: string) => c.startsWith('recent-sessions:'))).toBe('recent-sessions:6')
    await page.reload()
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)
    const w = await page.locator('.ov-bento > .ov-cell', { hasText: 'Recent sessions' }).first().evaluate((e) => getComputedStyle(e).gridColumnStart)
    expect(w).toBe('span 6')
  })

  test('a card never goes below its minimum, and Escape restores the width', async ({ page }) => {
    await createCampaign(page)
    await edit(page)
    const h = await centre(resizer(page, 'World overview'))
    await page.mouse.move(h.x, h.y)
    await page.mouse.down()
    await page.mouse.move(await edgeFor(page, 'World overview', 1), h.y, { steps: 10 })
    await expect.poll(() => span(page, 'World overview')).toBe('span 6') // minimum is half
    await page.keyboard.press('Escape')
    await expect.poll(() => span(page, 'World overview')).toBe('span 12')
    await page.mouse.up()
    await expect.poll(() => span(page, 'World overview')).toBe('span 12')
    expect(await stored(page)).toBeNull()
    await expect(live(page)).toContainText('Resize cancelled')
  })

  test('the handles add no sideways scroll, and arrow keys on a focused handle still resize', async ({ page }) => {
    await createCampaign(page)
    await edit(page)
    const overflow = await page.evaluate(() => { const el = document.querySelector('.main') as HTMLElement; return el.scrollWidth - el.clientWidth })
    expect(overflow).toBeLessThanOrEqual(0)
    await resizer(page, 'Recent sessions').focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => span(page, 'Recent sessions')).toBe('span 12')
    await expect(resizer(page, 'Recent sessions')).toBeFocused()
  })
})

test.describe('no pointer handles below 961px', () => {
  for (const [w, name] of [[800, 'tablet'], [375, 'phone']] as const) {
    test(`${name}: no drag handle and no resize handle, the buttons remain`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 })
      await createCampaign(page)
      await edit(page)
      await expect(page.locator('.ov-edit-grip')).toHaveCount(0)
      await expect(page.locator('.ov-resize-handle')).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^Move Prep later/ })).toBeVisible()
    })
  }
})

test.describe('pointer drag (demo)', () => {
  test.use({ viewport: { width: 1440, height: 2600 } }) // tall, so every card is on screen
  test('a drag works for the page view, saves nothing, and makes no Supabase request', async ({ page, supabaseRequests }) => {
    await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
    await page.addInitScript(() => {
      window.__load = (p: string) => import(/* @vite-ignore */ p)
    })
    await page.goto('/#/campaign/demo-campaign-0001')
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)
    await edit(page)
    const from = await centre(grip(page, 'Reference'))
    const world = (await cellOf(page, 'World overview').boundingBox())!
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(world.x + 200, world.y + 10, { steps: 8 })
    await page.mouse.up()
    expect((await titles(page))[0]).toBe('Reference')
    expect(await stored(page)).toBeNull()
    expect(supabaseRequests).toEqual([])
  })
})

// T-121: the drop target is measured in an animation frame. On a busy page (a loaded CI
// machine, a slow phone) the release can arrive before the last move has had its frame. The
// drop must use the release point, not the last measured one. Stalling requestAnimationFrame
// makes that case certain instead of timing-dependent.
test.describe('release before the last animation frame', () => {
  test.use({ viewport: { width: 1440, height: 2600 } })

  test('a move drop uses the release point', async ({ page }) => {
    await createCampaign(page)
    await edit(page)
    const from = await centre(grip(page, 'Run'))
    const world = (await cellOf(page, 'World overview').boundingBox())!
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    // The first measure (at pointerdown) is the only one that runs; every later frame stalls.
    await page.evaluate(() => {
      window.requestAnimationFrame = () => 0
    })
    await page.mouse.move(world.x + 200, world.y + 10, { steps: 6 })
    await page.mouse.up()
    await expect.poll(async () => (await titles(page))[0]).toBe('Run')
  })
})
