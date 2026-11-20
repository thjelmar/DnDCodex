import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { deriveHubCards, gridSize, plainExcerpt, type HubInput } from '../src/lib/hubCards'

// The Overview hub cards (T-74): Prep, Run, World & Lore and Reference. The logic
// is plain functions; the page is checked populated (demo), empty (a new campaign),
// at 375px, and in the light theme. Local only: the demo must make no cloud calls.

const DEMO_PATH = '/#/campaign/demo-campaign-0001'

async function openDemo(page: Page): Promise<void> {
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(DEMO_PATH)
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
}

async function createCampaign(page: Page): Promise<void> {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start a campaign' }).click()
  await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Hub ${Date.now()}`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
}

const card = (page: Page, name: string) => page.locator('.ov-hubcard', { has: page.getByRole('heading', { name }) })

// ---- logic ---------------------------------------------------------------

const empty: HubInput = {
  pendingTasks: 0,
  sessions: [],
  npcs: [],
  locations: [],
  items: [],
  notes: [],
  tables: [],
  scenes: [],
  mappedLocationIds: [],
  timelineCount: 0,
  familyCount: 0,
}

test.describe('hub card logic', () => {
  test('an empty campaign gives zeros and nulls, never NaN', () => {
    const h = deriveHubCards(empty)
    expect(h.prep.lastSession).toBeNull()
    expect(h.run.latestScene).toBeNull()
    expect(h.run.grid).toBeNull()
    expect(h.run.ready).toBe(false)
    expect(h.world.empty).toBe(true)
    expect(h.reference.recentItems).toEqual([])
    expect(JSON.stringify(h)).not.toMatch(/NaN|undefined/)
  })

  test('prep: the last session is the newest by date, with a plain excerpt', () => {
    const h = deriveHubCards({
      ...empty,
      pendingTasks: 2,
      sessions: [
        { id: 'a', title: 'Old', date: '2026-01-01', notes: 'x' },
        { id: 'b', title: 'New', date: '2026-02-01', notes: '## Recap\n**Bold** and [[Lord Mordrek]] met <em>in</em> the vault.' },
      ],
    })
    expect(h.prep.pendingTasks).toBe(2)
    expect(h.prep.lastSession).toEqual({
      id: 'b',
      title: 'New',
      date: '2026-02-01',
      excerpt: 'Recap Bold and Lord Mordrek met in the vault.',
    })
  })

  test('plainExcerpt strips markup, collapses space, and cuts at a word with an ellipsis', () => {
    expect(plainExcerpt('<p>Hello&nbsp;<b>world</b></p>')).toBe('Hello world')
    expect(plainExcerpt('- one\n- two\n\n[link](http://x.y)')).toBe('one two link')
    expect(plainExcerpt(null)).toBe('')
    // Rich text stores & and quotes as entities; show them as characters.
    expect(plainExcerpt('<p>Loot &amp; Rewards, &quot;The Signet&quot; isn&#39;t &lt;3</p>')).toBe('Loot & Rewards, "The Signet" isn\'t <3')
    expect(plainExcerpt('a &amp;lt; b')).toBe('a &lt; b')
    const long = plainExcerpt('word '.repeat(100), 30)
    expect(long.endsWith('…')).toBe(true)
    expect(long.length).toBeLessThanOrEqual(31)
    expect(long).not.toMatch(/wor…$/)
  })

  test('run: latest scene by updatedAt, grid size from the cell size, ready needs a session and a scene', () => {
    const scenes = [
      { id: 's1', name: 'Old', width: 100, height: 100, cellPx: 50, updatedAt: '2026-01-01T00:00:00Z' },
      { id: 's2', name: 'Vault', width: 1200, height: 900, cellPx: 50, updatedAt: '2026-02-01T00:00:00Z' },
    ]
    const h = deriveHubCards({ ...empty, scenes })
    expect(h.run.latestScene).toEqual({ id: 's2', name: 'Vault' })
    expect(h.run.grid).toEqual({ cols: 24, rows: 18 })
    expect(h.run.scenes).toBe(2)
    expect(h.run.ready).toBe(false)
    const ready = deriveHubCards({ ...empty, scenes, sessions: [{ id: 'a', title: 'S', date: '2026-01-01', notes: '' }] })
    expect(ready.run.ready).toBe(true)
  })

  test('gridSize returns null for a missing or zero cell size', () => {
    expect(gridSize({ width: 800, height: 600, cellPx: 0 })).toBeNull()
    expect(gridSize({ width: 0, height: 600, cellPx: 50 })).toBeNull()
    expect(gridSize({ width: 800, height: 600, cellPx: 50 })).toEqual({ cols: 16, rows: 12 })
  })

  test('world: hostile count, mapped locations count each location once and ignore deleted ones', () => {
    const h = deriveHubCards({
      ...empty,
      npcs: [{ disposition: 'hostile' }, { disposition: 'friendly' }, { disposition: 'hostile' }],
      locations: [{ id: 'l1' }, { id: 'l2' }],
      mappedLocationIds: ['l1', 'l1', 'gone'],
      familyCount: 3,
      notes: [{}, {}],
    })
    expect(h.world).toMatchObject({ npcs: 3, hostile: 2, locations: 2, mapped: 1, notes: 2, families: 3, empty: false })
  })

  test('reference: three newest items, distinct tags across every table', () => {
    const items = ['a', 'b', 'c', 'd'].map((n, i) => ({
      id: n,
      name: `Item ${n}`,
      rarity: 'rare',
      updatedAt: `2026-01-0${i + 1}T00:00:00Z`,
      tags: i === 0 ? ['loot', 'magic'] : [],
    }))
    const h = deriveHubCards({
      ...empty,
      items,
      npcs: [{ disposition: 'friendly', tags: ['loot', 'noble'] }],
      tables: [{ tags: ['magic'] }],
    })
    expect(h.reference.recentItems.map((i) => i.id)).toEqual(['d', 'c', 'b'])
    expect(h.reference.items).toBe(4)
    expect(h.reference.tags).toBe(3)
  })
})

// ---- pages ---------------------------------------------------------------

test.describe('hub cards, populated (demo)', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('every card shows its summary and links, and the demo makes no cloud request', async ({ page, supabaseRequests }) => {
    await openDemo(page)

    const prep = card(page, 'Prep')
    await expect(prep).toContainText(/\d+ pending|All set/)
    await expect(prep.getByRole('link', { name: 'Plan next session' })).toHaveAttribute('href', /planner=1/)
    await expect(prep.getByText('Session 3 — The Sunken Vault')).toBeVisible()
    await expect(prep.locator('.ov-tile', { hasText: 'Sessions' })).toContainText('3')

    const run = card(page, 'Run')
    await expect(run.getByRole('link', { name: 'Start Run Mode' })).toHaveAttribute('href', /\/run\/demo-campaign-0001$/)
    await expect(run.locator('.ov-tile', { hasText: 'Battle maps' })).not.toContainText('—')
    await expect(run.locator('.ov-tile', { hasText: 'Grid' })).toContainText('×')

    const world = card(page, 'World & Lore')
    await expect(world.locator('.ov-tile', { hasText: 'NPCs' })).toContainText('4')
    await expect(world.locator('.ov-tile', { hasText: 'NPCs' })).toContainText('1 hostile')
    await expect(world.locator('.ov-tile', { hasText: 'Locations' })).toContainText('4')
    await expect(world.locator('.ov-tile', { hasText: 'World notes' })).toContainText('2')

    const ref = card(page, 'Reference')
    await expect(ref.locator('.ov-chip')).toHaveCount(3)
    await expect(ref.locator('.ov-tile', { hasText: 'Items' })).toContainText('3')
    await expect(ref.locator('.ov-tile', { hasText: 'Roll tables' })).toContainText('1')

    // A tile navigates to its page.
    await world.locator('.ov-tile', { hasText: 'NPCs' }).click()
    await expect(page).toHaveURL(/\/campaign\/demo-campaign-0001\/npcs$/)
    expect(supabaseRequests).toEqual([])
  })

  test('the old stat tiles are gone and the 2 by 2 grid sits above the main column', async ({ page }) => {
    await openDemo(page)
    await expect(page.locator('.ov-stats')).toHaveCount(0)
    const prep = (await card(page, 'Prep').boundingBox())!
    const run = (await card(page, 'Run').boundingBox())!
    const world = (await card(page, 'World & Lore').boundingBox())!
    expect(run.x).toBeGreaterThan(prep.x + prep.width - 1) // two columns
    expect(world.y).toBeGreaterThan(prep.y + prep.height - 1) // second row
    const ref = (await card(page, 'Reference').boundingBox())!
    const cardsBottom = Math.max(world.y + world.height, ref.y + ref.height)
    // The cards sit above both columns: the World overview column and the side column.
    const left = (await page.locator('.ov-world').boundingBox())!
    const side = (await page.locator('.ov-side').boundingBox())!
    expect(left.y).toBeGreaterThan(cardsBottom - 1)
    expect(side.y).toBeGreaterThan(cardsBottom - 1)
    expect(side.x).toBeGreaterThan(left.x + left.width - 1)
  })

  test('tiles are keyboard reachable with a visible focus outline that is not clipped', async ({ page }) => {
    await openDemo(page)
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab')
      const hit = await page.evaluate(() => document.activeElement?.classList.contains('ov-tile') === true)
      if (hit) break
    }
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const cs = getComputedStyle(el)
      return { cls: el.className, width: cs.outlineWidth, style: cs.outlineStyle }
    })
    expect(outline.cls).toContain('ov-tile')
    expect(outline.style).toBe('solid')
    expect(outline.width).toBe('2px')
  })
})

test.describe('hub cards, empty campaign', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('every card has an empty state and nothing looks broken', async ({ page }) => {
    await createCampaign(page)

    await expect(card(page, 'Prep')).toContainText('No sessions yet')
    await expect(card(page, 'Prep').getByRole('link', { name: 'Log your first session' })).toBeVisible()
    await expect(card(page, 'Prep')).toContainText('3 pending')

    await expect(card(page, 'Run')).toContainText('No battle map yet')
    await expect(card(page, 'Run').getByRole('link', { name: 'Start Run Mode' })).toBeVisible()
    await expect(card(page, 'Run').locator('.ov-tile', { hasText: 'Grid' })).toContainText('—')
    await expect(card(page, 'Run')).not.toContainText('Ready to launch')

    await expect(card(page, 'World & Lore')).toContainText('Your world is empty')
    await expect(card(page, 'World & Lore').locator('.ov-tile', { hasText: 'NPCs' })).toContainText('0')

    await expect(card(page, 'Reference')).toContainText('No items yet')
    await expect(card(page, 'Reference').locator('.ov-chip')).toHaveCount(0)

    const text = await page.locator('.ov-hub').innerText()
    expect(text).not.toMatch(/NaN|undefined|null/)
  })

  test('a card updates when data is added', async ({ page }) => {
    await createCampaign(page)
    const id = new URL(page.url()).hash.split('/')[2]
    await page.goto(`/#/campaign/${id}/sessions`)
    await page.getByRole('button', { name: 'New Session' }).click()
    await expect(page.getByText('Session 1').first()).toBeVisible()
    await page.goto(`/#/campaign/${id}`)
    await expect(card(page, 'Prep')).not.toContainText('No sessions yet')
    await expect(card(page, 'Prep').getByText('Session 1')).toBeVisible()
    await expect(card(page, 'Prep').locator('.ov-tile', { hasText: 'Sessions' })).toContainText('1')
  })
})

test.describe('hub cards at 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('order, collapsing, and no sideways scroll', async ({ page }) => {
    await openDemo(page)
    const y = async (loc: ReturnType<Page['locator']>) => (await loc.first().boundingBox())!.y
    const world = page.getByRole('heading', { name: 'World overview' })
    const recent = page.getByRole('heading', { name: 'Recent sessions' })
    const links = page.getByRole('heading', { name: 'Links' })
    const prep = page.locator('.ov-hub').getByRole('heading', { name: 'Prep', exact: true })

    // World overview, then the hub cards, then Recent sessions, then Links and Voice.
    const order = [await y(world), await y(prep), await y(recent), await y(links)]
    expect(order).toEqual([...order].sort((a, b) => a - b))

    const toggle = (name: string) => page.locator('.ov-hub').getByRole('button', { name, exact: true })
    await expect(toggle('Prep')).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle('Run')).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle('World & Lore')).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle('Reference')).toHaveAttribute('aria-expanded', 'false')

    await toggle('World & Lore').click()
    await expect(card(page, 'World & Lore').locator('.ov-tile', { hasText: 'NPCs' })).toBeVisible()

    // One column: every card spans the same width and each sits below the previous one.
    const boxes = []
    for (const n of ['Prep', 'Run', 'World & Lore', 'Reference']) boxes.push((await card(page, n).boundingBox())!)
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].x).toBeCloseTo(boxes[0].x, 0)
      expect(boxes[i].width).toBeCloseTo(boxes[0].width, 0)
      expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y)
    }

    // Cards stay inside the screen and the page does not scroll sideways.
    for (const n of ['Prep', 'Run', 'World & Lore', 'Reference']) {
      const b = (await card(page, n).boundingBox())!
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(376)
    }
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.main') as HTMLElement
      return el.scrollWidth - el.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('an empty campaign shows the cards without breaking the layout', async ({ page }) => {
    await createCampaign(page)
    await expect(card(page, 'Prep')).toContainText('No sessions yet')
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.main') as HTMLElement
      return el.scrollWidth - el.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

// WCAG contrast ratio of two CSS rgb() strings.
function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map((v) => {
      const s = Number(v) / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test.describe('hub cards, light theme', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('text and pills keep contrast on the light surfaces, tiles have a border', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('codex.theme', 'light'))
    await openDemo(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    const read = (sel: string) =>
      page.locator(sel).first().evaluate((el) => {
        const cs = getComputedStyle(el)
        const bgOf = (n: Element | null): string => {
          while (n) {
            const bg = getComputedStyle(n).backgroundColor
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg
            n = n.parentElement
          }
          return 'rgb(255, 255, 255)'
        }
        return { fg: cs.color, bg: bgOf(el), border: cs.borderTopWidth }
      })

    for (const sel of ['.ov-pill', '.ov-tile-label', '.ov-tile-value', '.ov-recap-text', '.ov-chip']) {
      const c = await read(sel)
      expect(contrast(c.fg, c.bg), `${sel} contrast (${c.fg} on ${c.bg})`).toBeGreaterThanOrEqual(4.5)
    }
    expect((await read('.ov-tile')).border).toBe('1px')
  })
})

// ---- review fixes: group role, reading order, focus ring ------------------

const ZONES = ['next', 'world', 'hub', 'recent', 'prep', 'side'] as const

/** Press Tab through the page and return the order in which the Overview's blocks
 *  first receive focus. */
async function focusOrder(page: Page): Promise<string[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const seen: string[] = []
  for (let i = 0; i < 160; i++) {
    await page.keyboard.press('Tab')
    const zone = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return 'none'
      if (el.closest('.ov-hubcard')) return 'hub'
      if (el.closest('.ov-world')) return 'world'
      if (el.closest('.ov-recent')) return 'recent'
      if (el.closest('.ov-extras')) return 'prep'
      if (el.closest('.ov-side')) return 'side'
      if (el.closest('.ov-next')) return 'next'
      return 'other'
    })
    if ((ZONES as readonly string[]).includes(zone) && !seen.includes(zone)) seen.push(zone)
    if (seen.length === ZONES.length) break
  }
  return seen
}

test.describe('hub cards, reading order and accessibility (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('the card wrapper is a labelled group', async ({ page }) => {
    await openDemo(page)
    const group = page.getByRole('group', { name: 'Campaign areas' })
    await expect(group).toBeVisible()
    await expect(group.locator('.ov-hubcard')).toHaveCount(4)
  })

  test('Tab order matches the visual order: cards, then the left column, then the side column', async ({ page }) => {
    await openDemo(page)
    expect(await focusOrder(page)).toEqual(['next', 'hub', 'world', 'recent', 'prep', 'side'])
    // And the page really shows them in that order: cards above, columns below.
    const hubBottom = (await page.locator('.ov-hub').boundingBox())!
    const world = (await page.locator('.ov-world').boundingBox())!
    expect(world.y).toBeGreaterThan(hubBottom.y + hubBottom.height - 1)
  })

  for (const theme of ['dark', 'light'] as const) {
    test(`focus ring shows and each element keeps its own corner radius (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('codex.theme', t), theme)
      await openDemo(page)
      for (const sel of ['.ov-hubcard .ov-tile', '.ov-hubcard .ov-recap', '.ov-hubcard .ov-chip']) {
        const el = page.locator(sel).first()
        await expect(el).toBeVisible()
        const before = await el.evaluate((e) => getComputedStyle(e).borderTopLeftRadius)
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        for (let i = 0; i < 160; i++) {
          await page.keyboard.press('Tab')
          if (await page.evaluate((s) => document.activeElement?.matches(s) === true, sel)) break
        }
        const after = await el.evaluate((e) => {
          const cs = getComputedStyle(e)
          return { radius: cs.borderTopLeftRadius, width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor }
        })
        expect(after.style, `${sel} outline style`).toBe('solid')
        expect(after.width, `${sel} outline width`).toBe('2px')
        expect(after.color, `${sel} outline colour`).not.toBe('rgba(0, 0, 0, 0)')
        expect(after.radius, `${sel} keeps its radius on focus`).toBe(before)
      }
    })
  }

  test('resizing across the breakpoint reorders the blocks without resetting panel state', async ({ page }) => {
    await openDemo(page)
    const worldToggle = page.getByRole('button', { name: 'World overview', exact: true })
    await worldToggle.click()
    await expect(worldToggle).toHaveAttribute('aria-expanded', 'false')

    await page.setViewportSize({ width: 375, height: 812 })
    const y = async (name: string) =>
      (await page.locator('.ov-bento').getByRole('heading', { name, exact: true }).first().boundingBox())!.y
    await expect.poll(async () => (await y('World overview')) < (await y('Prep'))).toBe(true)
    // The panel was moved, not remounted: it is still closed (a fresh phone mount would open it).
    await expect(worldToggle).toHaveAttribute('aria-expanded', 'false')

    await page.setViewportSize({ width: 1440, height: 1000 })
    await expect.poll(async () => (await y('Prep')) < (await y('World overview'))).toBe(true)
  })
})

test.describe('hub cards, reading order (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('Tab order reaches the World overview before the cards, then Recent sessions, the checklist and Links', async ({ page }) => {
    await openDemo(page)
    expect(await focusOrder(page)).toEqual(['next', 'world', 'hub', 'recent', 'prep', 'side'])
  })
})
