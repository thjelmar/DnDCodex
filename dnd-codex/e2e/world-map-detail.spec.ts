import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// World map detail maps (T-94): a pin opens a more detailed map with a zoom, and a
// Close button returns. Editor tests run on the demo (the Caldemar pin opens a town map);
// the player test serves a shared map through mocked Supabase responses.

const CID = 'demo-campaign-0001'
const MAP_PATH = `/#/campaign/${CID}/worldmap`
const DETAIL = 'demo-worldmap-caldemar'
const SETTLE = 1500

async function openDemoMap(page: Page, path = MAP_PATH) {
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(path)
  await expect(page.locator('.wm-stage')).toBeVisible()
}

const crumbs = (page: Page) => page.locator('.wm-crumbs')
const detailPin = (page: Page) => page.locator('.wm-layer .worldmap-pin.has-detail').first()
const topPins = (page: Page) => page.locator('.wm-layer:not(.is-covered) .worldmap-pin')

/** The page position of the first pin in the larger map, to prove pan and zoom return. */
const firstPinPos = (page: Page) =>
  page.locator('.wm-layer').first().locator('.worldmap-pin').first().evaluate((el) => {
    // Relative to the stage, so a page scroll between reads does not matter.
    const r = el.getBoundingClientRect()
    const s = document.querySelector('.wm-stage')!.getBoundingClientRect()
    return [Math.round(r.x - s.x), Math.round(r.y - s.y)]
  })

/** Record the keyframe properties of every animation the app starts. Call before the click. */
const recordAnimations = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __animProps: string[] }
    w.__animProps = []
    const orig = Element.prototype.animate
    Element.prototype.animate = function (this: Element, kf: Keyframe[] | PropertyIndexedKeyframes | null, o?: number | KeyframeAnimationOptions) {
      const keys = Array.isArray(kf) ? kf.flatMap((k) => Object.keys(k)) : Object.keys(kf ?? {})
      w.__animProps.push(...keys)
      return orig.call(this, kf, o)
    }
  })
const animProps = (page: Page) => page.evaluate(() => (window as unknown as { __animProps: string[] }).__animProps)

const demoMaps = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Array<{ id: string; pins: Array<{ detailMapId?: string }> }>>((res, rej) => {
        const r = indexedDB.open('dnd-codex-demo')
        r.onerror = () => rej(r.error)
        r.onsuccess = () => {
          const q = r.result.transaction('worldMaps').objectStore('worldMaps').getAll()
          q.onsuccess = () => res(q.result)
        }
      }),
  )

test.describe('world map detail maps: editor', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('double-click opens the detail map, Close restores the larger map pan and zoom', async ({ page, supabaseRequests }) => {
    await openDemoMap(page)
    await expect(detailPin(page)).toBeVisible()
    await expect(crumbs(page)).toHaveCount(0)

    // Zoom the larger map first, so a restored view is not just the default fit.
    await page.locator('.wm-layer').first().locator('.worldmap-canvas').hover()
    await page.mouse.wheel(0, -300)
    await page.waitForTimeout(150)
    const before = await firstPinPos(page)

    await detailPin(page).dblclick()
    await expect(page).toHaveURL(new RegExp(`worldmap\\?map=${DETAIL}$`))
    await expect(crumbs(page)).toContainText('The Realm of Caldemar')
    await expect(crumbs(page)).toContainText('Caldemar')
    await expect(page.getByRole('button', { name: /Close the detail map/ })).toBeVisible()
    await expect(topPins(page)).toHaveCount(3, { timeout: SETTLE * 2 })

    await page.getByRole('button', { name: /Close the detail map/ }).click()
    await expect(page).toHaveURL(new RegExp(`worldmap$`))
    await expect(page.locator('.wm-layer')).toHaveCount(1, { timeout: SETTLE * 2 })
    expect(await firstPinPos(page)).toEqual(before)
    expect(supabaseRequests).toEqual([])
  })

  test('a single click selects the pin; Open in the inspector zooms in; Escape and browser back close', async ({ page }) => {
    await openDemoMap(page)
    await detailPin(page).click()
    await expect(page).toHaveURL(new RegExp(`worldmap$`))
    await expect(page.locator('.worldmap-inspector')).toContainText('Detail map')

    await page.locator('.worldmap-inspector').getByRole('button', { name: 'Open', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`map=${DETAIL}`))
    await expect(topPins(page)).toHaveCount(3, { timeout: SETTLE * 2 })

    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(new RegExp(`worldmap$`))
    await expect(page.locator('.wm-layer')).toHaveCount(1, { timeout: SETTLE * 2 })

    await detailPin(page).dblclick()
    await expect(topPins(page)).toHaveCount(3, { timeout: SETTLE * 2 })
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`worldmap$`))
    await expect(page.locator('.wm-layer')).toHaveCount(1, { timeout: SETTLE * 2 })
  })

  test('a direct load of ?map= opens the detail map, and Close returns to the larger map', async ({ page }) => {
    await openDemoMap(page, `${MAP_PATH}?map=${DETAIL}`)
    await expect(crumbs(page)).toContainText('Caldemar')
    await expect(topPins(page)).toHaveCount(3)
    await crumbs(page).getByRole('button', { name: /Close/ }).click()
    await expect(page).toHaveURL(new RegExp(`worldmap$`))
    await expect(page.locator('.wm-layer')).toHaveCount(1, { timeout: SETTLE * 2 })
  })

  test('a pin inside a detail map links to a location and opens its sheet', async ({ page }) => {
    await openDemoMap(page, `${MAP_PATH}?map=${DETAIL}`)
    await topPins(page).filter({ hasText: 'Market square' }).click()
    await expect(page.locator('.worldmap-inspector input.input').first()).toHaveValue('Market square')
    await page.locator('.worldmap-inspector').getByRole('button', { name: /^Open / }).click()
    await expect(page).toHaveURL(/\/locations\?sel=/)
  })

  test('deleting the pin asks first, then deletes its detail map', async ({ page }) => {
    await openDemoMap(page)
    expect((await demoMaps(page)).map((m) => m.id)).toContain(DETAIL)
    await detailPin(page).click()
    await page.locator('.worldmap-inspector').getByRole('button', { name: /Delete/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('detail map')
    await dialog.getByRole('button', { name: 'Delete both' }).click()
    await expect.poll(async () => (await demoMaps(page)).map((m) => m.id)).not.toContain(DETAIL)
    await expect(page.locator('.worldmap-pin.has-detail')).toHaveCount(0)
  })

  test('cancelling the delete keeps the pin and its detail map', async ({ page }) => {
    await openDemoMap(page)
    await detailPin(page).click()
    await page.locator('.worldmap-inspector').getByRole('button', { name: /Delete/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Cancel/ }).click()
    expect((await demoMaps(page)).map((m) => m.id)).toContain(DETAIL)
    await expect(detailPin(page)).toBeVisible()
  })
})

test.describe('world map detail maps: motion', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('the open transition scales the layers', async ({ page }) => {
    await openDemoMap(page)
    await recordAnimations(page)
    await detailPin(page).dblclick()
    await expect(topPins(page)).toHaveCount(3, { timeout: SETTLE * 2 })
    const props = await animProps(page)
    expect(props).toContain('transform')
    expect(props).toContain('opacity')
  })

  test('with reduced motion the open transition only cross-fades', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openDemoMap(page)
    await recordAnimations(page)
    await detailPin(page).dblclick()
    await expect(topPins(page)).toHaveCount(3, { timeout: SETTLE * 2 })
    const props = await animProps(page)
    expect(props).toContain('opacity')
    expect(props).not.toContain('transform')
    await expect(topPins(page)).toHaveCount(3, { timeout: SETTLE * 2 })
  })
})

test.describe('world map detail maps: phone', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true })

  test('the Close button is at least 38px and closes the detail map', async ({ page }) => {
    await openDemoMap(page, `${MAP_PATH}?map=${DETAIL}`)
    const close = page.getByRole('button', { name: /Close the detail map/ })
    await expect(close).toBeVisible()
    const box = await close.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(38)
    expect(box!.width).toBeGreaterThanOrEqual(38)
    await close.tap()
    await expect(page).toHaveURL(new RegExp(`worldmap$`))
  })
})

// --- Editor on a real (non-demo) campaign: the demo blocks image uploads ---------

const DM_CID = 'dm-camp-1'
const TS = '2026-01-01T00:00:00Z'

async function putRows(page: Page, rows: Array<[string, object]>) {
  await page.goto('/')
  await page.waitForFunction(async () => (await indexedDB.databases()).some((d) => d.name === 'dnd-codex'))
  await page.evaluate(async (all) => {
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open('dnd-codex')
      r.onerror = () => rej(r.error)
      r.onsuccess = () => {
        const stores = [...new Set(all.map(([s]) => s))]
        const tx = r.result.transaction(stores, 'readwrite')
        for (const [store, row] of all) tx.objectStore(store).put(row)
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      }
    })
  }, rows)
}

test.describe('world map detail maps: editor on a real campaign', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('a pin gets a detail map by upload, opens it, and Remove detail map deletes it', async ({ page }) => {
    await putRows(page, [
      ['campaigns', { id: DM_CID, name: 'Real camp', color: '#8b5cf6', relatedCampaignIds: [], archived: false, coverImageId: null, role: 'dm', externalLinks: [], linkedCampaignId: null, createdAt: TS, updatedAt: TS }],
      ['images', { id: 'img-root', campaignId: DM_CID, name: 'root.png', mime: 'image/png', dataUrl: PNG, width: 800, height: 500, bytes: 100, createdAt: TS, updatedAt: TS }],
      ['worldMaps', { id: 'map-root', campaignId: DM_CID, name: 'Realm of Test', imageId: 'img-root', width: 800, height: 500, pins: [{ id: 'pin-a', x: 0.5, y: 0.5, label: 'Harbor', color: '#e2504a', ref: null }], createdAt: TS, updatedAt: TS }],
    ])
    await page.goto(`/#/campaign/${DM_CID}/worldmap`)
    await page.locator('.wm-layer .worldmap-pin', { hasText: 'Harbor' }).click()
    const inspector = page.locator('.worldmap-inspector')
    await inspector.locator('input[type=file]').first().setInputFiles({
      name: 'harbor.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG.split(',')[1], 'base64'),
    })
    await expect(inspector.getByLabel('Detail map name')).toHaveValue('Harbor')
    await expect(page.locator('.worldmap-pin.has-detail')).toHaveCount(1)

    await inspector.getByRole('button', { name: 'Open', exact: true }).click()
    await expect(page).toHaveURL(/map=/)
    await expect(crumbs(page)).toContainText('Realm of Test')
    await expect(crumbs(page)).toContainText('Harbor')
    // Inside a detail map, a pin gets no "Add detail map" (one level in the UI).
    const box = await topCanvasBox(page)
    await page.mouse.click(box.x + 60, box.y + 120)
    await expect(inspector.getByRole('button', { name: 'Add detail map' })).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(page.locator('.wm-layer')).toHaveCount(1, { timeout: SETTLE * 2 })
    await page.locator('.wm-layer .worldmap-pin', { hasText: 'Harbor' }).click()
    await inspector.getByRole('button', { name: 'Remove detail map' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect(page.locator('.worldmap-pin.has-detail')).toHaveCount(0)
    const left = await page.evaluate(
      () =>
        new Promise<number>((res) => {
          const r = indexedDB.open('dnd-codex')
          r.onsuccess = () => {
            const q = r.result.transaction('worldMaps').objectStore('worldMaps').count()
            q.onsuccess = () => res(q.result)
          }
        }),
    )
    expect(left).toBe(1)
  })
})

const topCanvasBox = async (page: Page) => (await page.locator('.wm-layer:not(.is-covered) .worldmap-canvas').boundingBox())!

// --- Player view -----------------------------------------------------------

const LINKED = '8f1c0b7e-0000-4000-8000-00000000a001'
const PLAYER_CID = 'player-camp-1'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function mockSharedMap(page: Page, withDetail = true) {
  await page.route('**/rest/v1/shared_world_maps*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        name: 'Realm of Test',
        image_id: 'root-img',
        width: 800,
        height: 500,
        pins: [
          { id: 'p1', x: 0.4, y: 0.4, label: 'Townsend', color: '#e2504a', ref: null, ...(withDetail ? { detailMapId: 'detail-1' } : {}) },
          { id: 'p2', x: 0.7, y: 0.6, label: 'Plain pin', color: '#378add', ref: null },
        ],
        detail_maps: withDetail
          ? [{ id: 'detail-1', parentMapId: 'dm-root', name: 'Townsend', imageId: 'detail-img', width: 600, height: 400, pins: [{ id: 'd1', x: 0.5, y: 0.5, label: 'Inn', color: '#1d9e75', ref: null }] }]
          : [],
      }),
    }),
  )
  await page.route('**/rest/v1/shared_images*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'root-img', data_url: PNG, caption: null, width: 800, height: 500, kind: 'worldmap', session_id: null, session_title: null, session_date: null, created_at: '2026-01-01T00:00:00Z' },
        { id: 'detail-img', data_url: PNG, caption: null, width: 600, height: 400, kind: 'worldmap', session_id: null, session_title: null, session_date: null, created_at: '2026-01-01T00:00:00Z' },
      ]),
    }),
  )
}

async function seedPlayerCampaign(page: Page) {
  await page.goto('/')
  await page.waitForFunction(async () => (await indexedDB.databases()).some((d) => d.name === 'dnd-codex'))
  await page.evaluate(
    async ([id, linked]) => {
      await new Promise<void>((res, rej) => {
        const r = indexedDB.open('dnd-codex')
        r.onerror = () => rej(r.error)
        r.onsuccess = () => {
          const tx = r.result.transaction('campaigns', 'readwrite')
          tx.objectStore('campaigns').put({
            id, name: 'Player copy', role: 'player', linkedCampaignId: linked,
            createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
          })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(tx.error)
        }
      })
    },
    [PLAYER_CID, LINKED],
  )
}

test.describe('world map detail maps: player view', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('tapping a pin with a detail map opens it; Close returns; a plain pin does nothing', async ({ page }) => {
    await seedPlayerCampaign(page)
    await mockSharedMap(page)
    await page.goto(`/#/player/${PLAYER_CID}/worldmap`)
    const pins = page.locator('.wm-layer .worldmap-pin')
    await expect(pins).toHaveCount(2)

    await pins.filter({ hasText: 'Plain pin' }).click()
    await expect(page).toHaveURL(/worldmap$/)
    await expect(crumbs(page)).toHaveCount(0)

    await pins.filter({ hasText: 'Townsend' }).click()
    await expect(page).toHaveURL(/worldmap\?map=detail-1$/)
    await expect(crumbs(page)).toContainText('Realm of Test')
    await expect(crumbs(page)).toContainText('Townsend')
    await expect(topPins(page)).toHaveCount(1, { timeout: SETTLE * 2 })
    await expect(topPins(page)).toContainText('Inn')

    await page.getByRole('button', { name: /Close the detail map/ }).click()
    await expect(page).toHaveURL(/worldmap$/)
    await expect(page.locator('.wm-layer')).toHaveCount(1, { timeout: SETTLE * 2 })
  })

  test('a shared map from before detail maps (no detail_maps column) still works', async ({ page }) => {
    await seedPlayerCampaign(page)
    await mockSharedMap(page, false)
    await page.goto(`/#/player/${PLAYER_CID}/worldmap`)
    await expect(page.locator('.wm-layer .worldmap-pin')).toHaveCount(2)
    await expect(page.locator('.worldmap-pin.has-detail')).toHaveCount(0)
  })
})

// Pin label readability (T-101): the label sits on a light chip with dark text, so it reads on any map image.
/** Contrast of the first pin's label text against its chip, plus the chip's alpha. */
const chipContrast = (page: Page) =>
  page.locator('.worldmap-pin').first().evaluate((el) => {
    const parse = (c: string) => {
      const m = c.match(/[\d.]+/g)!.map(Number)
      return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }
    }
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const bg = parse(getComputedStyle(el).backgroundColor)
    const fg = parse(getComputedStyle(el.querySelector('.worldmap-pin-label')!).color)
    // Worst case: the chip sits on a black map, so blend it over black.
    const over = { r: bg.r * bg.a, g: bg.g * bg.a, b: bg.b * bg.a }
    const [a, b] = [lum(over), lum(fg)]
    return { alpha: bg.a, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
  })

test.describe('world map pin labels are readable', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('editor: the label chip is opaque enough and meets 4.5:1 contrast', async ({ page }) => {
    await openDemoMap(page)
    const { alpha, ratio } = await chipContrast(page)
    expect(alpha).toBeGreaterThanOrEqual(0.85)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  test('player view: the label chip is opaque enough and meets 4.5:1 contrast', async ({ page }) => {
    await seedPlayerCampaign(page)
    await mockSharedMap(page)
    await page.goto(`/#/player/${PLAYER_CID}/worldmap`)
    await expect(page.locator('.worldmap-pin')).toHaveCount(2)
    const { alpha, ratio } = await chipContrast(page)
    expect(alpha).toBeGreaterThanOrEqual(0.85)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })
})
