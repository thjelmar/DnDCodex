import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { thumbSize, REUSE_BELOW_CHARS } from '../src/lib/thumbnail'
import { pickPortraitNpcs } from '../src/lib/hubCards'

// The pictures on the Overview hub cards (T-75): NPC portraits and a world map
// thumbnail on the World card, a battle map thumbnail with token avatars on the Run
// card. The point of these tests is cost as much as looks: images are fetched one at
// a time by primary key, only when on screen, and the `images` table is never scanned.

const CID = 'demo-campaign-0001'
const DEMO_PATH = `/#/campaign/${CID}`

// Count reads of the `images` object store at the IndexedDB level: `get` by key is
// recorded by key; any list or cursor read of the store (or one of its indexes) is a
// scan and must never happen.
const INSTRUMENT = () => {
  type Log = { gets: string[]; scans: string[] }
  const w = window as unknown as { __idb: Log }
  w.__idb = { gets: [], scans: [] }
  const S = IDBObjectStore.prototype
  const I = IDBIndex.prototype
  const origGet = S.get
  S.get = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['get']>) {
    if (this.name === 'images') w.__idb.gets.push(String(args[0]))
    return origGet.apply(this, args)
  }
  for (const m of ['getAll', 'getAllKeys', 'openCursor', 'openKeyCursor']) {
    const wrapProto = (proto: object, storeName: (t: { name?: string; objectStore?: { name: string } }) => string | undefined) => {
      const target = proto as Record<string, (...a: unknown[]) => unknown>
      const orig = target[m]
      target[m] = function (this: { name?: string; objectStore?: { name: string } }, ...args: unknown[]) {
        if (storeName(this) === 'images') w.__idb.scans.push(m)
        return orig.apply(this, args)
      }
    }
    wrapProto(S, (t) => t.name)
    wrapProto(I, (t) => t.objectStore?.name)
  }
}

type IdbLog = { gets: string[]; scans: string[] }
const readLog = (page: Page) => page.evaluate(() => (window as unknown as { __idb: IdbLog }).__idb)
const resetLog = (page: Page) =>
  page.evaluate(() => {
    const l = (window as unknown as { __idb: IdbLog }).__idb
    l.gets.length = 0
    l.scans.length = 0
  })

async function openDemo(page: Page, theme?: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(INSTRUMENT)
  await page.addInitScript((t) => {
    sessionStorage.setItem('codex-demo', '1')
    if (t) localStorage.setItem('codex.theme', t)
  }, theme ?? null)
  await page.goto(DEMO_PATH)
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
}

/** Put real image records into the demo database (raw IndexedDB, then reload). The
 *  seed leaves NPCs without portraits and the battle map without an image. */
async function injectImages(page: Page) {
  const ids = await page.evaluate(async (cid) => {
    const open = () =>
      new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('dnd-codex-demo')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
    const draw = (w: number, h: number, noisy: boolean) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const x = c.getContext('2d')!
      const g = x.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#1d2b53')
      g.addColorStop(1, '#d9a441')
      x.fillStyle = g
      x.fillRect(0, 0, w, h)
      if (noisy) {
        for (let i = 0; i < 4000; i++) {
          x.fillStyle = `rgb(${(Math.random() * 255) | 0},${(Math.random() * 255) | 0},${(Math.random() * 255) | 0})`
          x.fillRect(Math.random() * w, Math.random() * h, 12, 12)
        }
      }
      return c.toDataURL('image/png')
    }
    const row = (id: string, dataUrl: string, w: number, h: number, extra: object = {}) => ({
      id,
      campaignId: cid,
      name: `${id}.png`,
      mime: 'image/png',
      dataUrl,
      width: w,
      height: h,
      bytes: Math.round(dataUrl.length * 0.75),
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
      ...extra,
    })
    const portrait = row('inj-portrait', draw(64, 64, false), 64, 64) // small: reused as it is
    const bigMap = row('inj-bigmap', draw(1600, 900, true), 1600, 900) // large: shrunk once
    const broken = row('inj-broken', 'data:image/png;base64,AAAA', 64, 64) // cannot decode
    const cloudOnly = row('inj-cloud', '', 800, 600, { storagePath: 'battlemaps/x.png' }) // no local copy
    const unrelated = Array.from({ length: 20 }, (_, i) => row(`inj-other-${i}`, draw(64, 64, false), 64, 64, { isHandout: true }))
    const db = await open()
    const tx = db.transaction(['images', 'npcs', 'scenes'], 'readwrite')
    const images = tx.objectStore('images')
    for (const r of [portrait, bigMap, broken, cloudOnly, ...unrelated]) images.put(r)
    const npcs = tx.objectStore('npcs')
    const patch = (store: IDBObjectStore, key: string, fields: object) =>
      new Promise<void>((res) => {
        const g = store.get(key)
        g.onsuccess = () => {
          store.put({ ...g.result, ...fields })
          res()
        }
      })
    await patch(npcs, 'demo-npc-innkeep', { imageId: 'inj-portrait', updatedAt: '2026-03-01T00:00:00.000Z' })
    await patch(npcs, 'demo-npc-rogue', { imageId: 'inj-broken', updatedAt: '2026-03-02T00:00:00.000Z' })
    await patch(npcs, 'demo-npc-king', { imageId: 'inj-missing', updatedAt: '2026-03-03T00:00:00.000Z' })
    await patch(tx.objectStore('scenes'), 'demo-scene-stag', { imageId: 'inj-bigmap' })
    await new Promise<void>((res) => (tx.oncomplete = () => res()))
    db.close()
    return { storedBigMap: bigMap.dataUrl.length, others: unrelated.map((u) => u.id) }
  }, CID)
  await page.reload()
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
  return ids
}

const card = (page: Page, name: string) => page.locator('.ov-hubcard', { has: page.getByRole('heading', { name }) })
const noBrokenImages = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.ov-hub img'))
      .filter((i) => (i as HTMLElement).offsetParent !== null)
      .filter((i) => !(i as HTMLImageElement).complete || (i as HTMLImageElement).naturalWidth === 0)
      .map((i) => (i as HTMLImageElement).alt),
  )

// ---- logic ---------------------------------------------------------------

test.describe('thumbnail and portrait logic', () => {
  test('thumbSize fits the long edge, never enlarges, and rejects bad input', () => {
    expect(thumbSize(1600, 900, 640)).toEqual({ width: 640, height: 360 })
    expect(thumbSize(900, 1600, 640)).toEqual({ width: 360, height: 640 })
    expect(thumbSize(200, 100, 640)).toEqual({ width: 200, height: 100 })
    expect(thumbSize(1, 1000, 100)).toEqual({ width: 1, height: 100 })
    expect(thumbSize(0, 100, 640)).toBeNull()
    expect(thumbSize(100, 100, 0)).toBeNull()
    expect(REUSE_BELOW_CHARS).toBeGreaterThan(0)
  })

  test('portrait picks: those with a portrait first, newest first, at most five', () => {
    const n = (id: string, imageId: string | null, updatedAt: string) => ({ id, imageId, updatedAt })
    const picked = pickPortraitNpcs([
      n('a', null, '2026-05-01'),
      n('b', 'i1', '2026-01-01'),
      n('c', 'i2', '2026-02-01'),
      n('d', null, '2026-04-01'),
      n('e', null, '2026-03-01'),
      n('f', null, '2026-02-01'),
    ])
    expect(picked.map((x) => x.id)).toEqual(['c', 'b', 'a', 'd', 'e'])
    expect(pickPortraitNpcs([])).toEqual([])
    expect(pickPortraitNpcs([n('z', null, '2026-01-01')], 5)).toHaveLength(1)
  })
})

// ---- pages ---------------------------------------------------------------

test.describe('hub card pictures, populated demo (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('the world map shows its real image; NPCs and the blank-grid battle map use placeholders, nothing broken', async ({ page, supabaseRequests }) => {
    await openDemo(page)
    const world = card(page, 'World & Lore')
    const map = world.getByRole('img', { name: /World map: The Realm of Caldemar/ })
    await expect(map).toBeVisible()
    await expect.poll(() => map.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    await expect(map).toHaveAttribute('loading', 'lazy')
    await expect(map).toHaveAttribute('decoding', 'async')

    // The seed has no NPC portraits, so each avatar is a glyph or initials and links to its sheet.
    await expect(world.locator('.ov-npc')).toHaveCount(4)
    await expect(world.locator('.ov-npc img')).toHaveCount(0)
    await expect(world.locator('.ov-npc', { hasText: 'Mordrek' })).toBeVisible()

    // The battle map is a blank grid: a placeholder with a screen-reader name, four token avatars, a caption.
    const run = card(page, 'Run')
    await expect(run.locator('.ov-battle img')).toHaveCount(0)
    await expect(run.locator('.ov-battle')).toContainText('Battle map: The Gilded Stag — Brawl')
    await expect(run.locator('.ov-avatars .ov-token')).toHaveCount(4)
    await expect(run.locator('.ov-media-cap')).toContainText('11 × 8 grid')

    expect(await noBrokenImages(page)).toEqual([])
    expect(supabaseRequests).toEqual([])
  })

  test('the picture links go to their pages and are keyboard reachable with a visible focus ring', async ({ page }) => {
    await openDemo(page)
    for (const sel of ['.ov-npc', '.ov-mapthumb', '.ov-battle']) {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      for (let i = 0; i < 160; i++) {
        await page.keyboard.press('Tab')
        if (await page.evaluate((s) => document.activeElement?.matches(s) === true, sel)) break
      }
      const ring = await page.evaluate(() => {
        const cs = getComputedStyle(document.activeElement as HTMLElement)
        return { style: cs.outlineStyle, width: cs.outlineWidth }
      })
      expect(ring, `${sel} focus ring`).toEqual({ style: 'solid', width: '2px' })
    }
    await card(page, 'World & Lore').locator('.ov-mapthumb').click()
    await expect(page).toHaveURL(new RegExp(`/campaign/${CID}/worldmap$`))
  })
})

test.describe('hub card pictures, real and broken images (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('portraits and a large battle map show as small previews; broken, missing and cloud-only images fall back', async ({ page }) => {
    await openDemo(page)
    const { storedBigMap } = await injectImages(page)
    await resetLog(page)
    await page.reload()
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)

    const world = card(page, 'World & Lore')
    // The small portrait is shown as it is.
    const portrait = world.locator('.ov-npc', { hasText: 'Bram' }).locator('img')
    await expect(portrait).toBeVisible()
    await expect.poll(() => portrait.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    // The broken one (undecodable) and the missing one fall back to initials: no broken-image icon.
    await expect(world.locator('.ov-npc', { hasText: 'Sable' }).locator('img')).toHaveCount(0)
    await expect(world.locator('.ov-npc', { hasText: 'King' }).locator('img')).toHaveCount(0)

    // The large battle map is shrunk: the displayed image is far smaller than the stored one.
    const battle = card(page, 'Run').locator('.ov-battle img')
    await expect(battle).toBeVisible()
    await expect.poll(() => battle.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    const shown = await battle.evaluate((i: HTMLImageElement) => ({ w: i.naturalWidth, h: i.naturalHeight, chars: i.src.length }))
    expect(shown.w).toBeLessThanOrEqual(640)
    expect(shown.chars).toBeLessThan(storedBigMap / 2)
    await expect(battle).toHaveAttribute('alt', 'Battle map: The Gilded Stag — Brawl')

    expect(await noBrokenImages(page)).toEqual([])
    // Cost, for the record (printed in the test output).
    console.log(`battle map: stored ${storedBigMap} chars (${Math.round(storedBigMap / 1024)} KB), shown ${shown.chars} chars (${Math.round(shown.chars / 1024)} KB) at ${shown.w}x${shown.h}`)
  })

  test('a cloud-only battle map image shows the grid placeholder and fetches nothing from Storage', async ({ page, supabaseRequests }) => {
    await openDemo(page)
    await injectImages(page)
    await page.evaluate(async () => {
      await new Promise<void>((res) => {
        const r = indexedDB.open('dnd-codex-demo')
        r.onsuccess = () => {
          const db = r.result
          const tx = db.transaction('scenes', 'readwrite')
          const s = tx.objectStore('scenes')
          const g = s.get('demo-scene-stag')
          g.onsuccess = () => s.put({ ...g.result, imageId: 'inj-cloud' })
          tx.oncomplete = () => {
            db.close()
            res()
          }
        }
      })
    })
    await page.reload()
    const run = card(page, 'Run')
    await expect(run.locator('.ov-battle')).toContainText('Map image not available on this device')
    await expect(run.locator('.ov-battle img')).toHaveCount(0)
    expect(supabaseRequests).toEqual([])
  })

  test('only the few images shown are read, by key; the images table is never scanned', async ({ page }) => {
    await openDemo(page)
    const { others } = await injectImages(page) // 20 unrelated handout images are in the table too
    await resetLog(page)
    await page.reload()
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)
    await expect(card(page, 'Run').locator('.ov-battle img')).toBeVisible()
    await expect(card(page, 'World & Lore').locator('.ov-npc', { hasText: 'Bram' }).locator('img')).toBeVisible()

    const log = await readLog(page)
    expect(log.scans, 'no list or cursor read of the images store').toEqual([])
    expect(log.gets.filter((id) => others.includes(id))).toEqual([]) // none of the 20 unrelated ones
    // Only what the cards show: 3 NPC portraits, the world map, the battle map (token portraits: none).
    expect(new Set(log.gets)).toEqual(new Set(['inj-portrait', 'inj-broken', 'inj-missing', 'inj-bigmap', 'demo-img-worldmap'].filter((id) => log.gets.includes(id))))
    expect(log.gets).toContain('inj-portrait')
    expect(log.gets).toContain('inj-bigmap')
    expect(log.gets.length).toBeLessThanOrEqual(8)
    console.log(`images read on the Overview: ${log.gets.length} records by key (${[...new Set(log.gets)].join(', ')}); table scans: ${log.scans.length}`)
  })
})

test.describe('hub card pictures at 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('a collapsed card fetches no images; opening it fetches them; the Run card (open) loads its map', async ({ page }) => {
    await openDemo(page)
    await injectImages(page)
    await resetLog(page)
    await page.reload()
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)

    // World & Lore starts collapsed on a phone: none of its pictures are read, however
    // long we wait. (The open Run card loads its map once it is scrolled near the screen.)
    await page.waitForTimeout(500)
    const before = await readLog(page)
    expect(before.gets).not.toContain('inj-portrait')
    expect(before.gets).not.toContain('inj-broken')
    expect(before.gets).not.toContain('inj-missing')
    expect(before.scans).toEqual([])

    await card(page, 'Run').scrollIntoViewIfNeeded()
    await expect(card(page, 'Run').locator('.ov-battle img')).toBeVisible()
    expect(await readLog(page).then((l) => l.gets)).toContain('inj-bigmap')

    await page.locator('.ov-hub').getByRole('button', { name: 'World & Lore', exact: true }).click()
    await expect(card(page, 'World & Lore').locator('.ov-npc', { hasText: 'Bram' }).locator('img')).toBeVisible()
    const after = await readLog(page)
    expect(after.gets).toContain('inj-portrait')
    expect(after.scans).toEqual([])
  })

  test('the picture boxes keep a fixed aspect ratio and the page does not scroll sideways', async ({ page }) => {
    await openDemo(page)
    await page.locator('.ov-hub').getByRole('button', { name: 'World & Lore', exact: true }).click()
    const ratio = async (sel: string) => {
      const b = (await page.locator(sel).first().boundingBox())!
      return b.width / b.height
    }
    expect(await ratio('.ov-media-battle')).toBeCloseTo(16 / 7, 1)
    expect(await ratio('.ov-media-map')).toBeCloseTo(16 / 7, 1)
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.main') as HTMLElement
      return el.scrollWidth - el.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('hub card pictures, empty campaign', () => {
  for (const [name, size] of [['desktop', { width: 1440, height: 1000 }], ['375px', { width: 375, height: 812 }]] as const) {
    test(`placeholders only, no images fetched, nothing broken (${name})`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.addInitScript(INSTRUMENT)
      await page.goto('/#/')
      await page.getByRole('button', { name: 'Start a campaign' }).click()
      await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Pics ${Date.now()}`)
      await page.getByRole('button', { name: 'Create', exact: true }).click()
      await expect(page.locator('.ov-hubcard')).toHaveCount(4)
      if (size.width < 500) await page.locator('.ov-hub').getByRole('button', { name: 'World & Lore', exact: true }).click()

      await expect(card(page, 'World & Lore')).toContainText('No world map yet')
      await expect(card(page, 'Run')).toContainText('No battle map yet')
      await expect(page.locator('.ov-hub img')).toHaveCount(0)
      await expect(page.locator('.ov-npc')).toHaveCount(0)
      const log = await readLog(page)
      expect(log.gets).toEqual([])
      expect(log.scans).toEqual([])
    })
  }
})

test.describe('hub card pictures, light theme', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('every picture box has a 1px border and placeholder text keeps contrast', async ({ page }) => {
    await openDemo(page, 'light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(card(page, 'World & Lore').getByRole('img', { name: /World map/ })).toBeVisible()
    // Map and battle boxes carry their own 1px border; avatar faces sit inside an avatar
    // circle that carries it (1px for NPCs).
    const boxes = await page.locator('.ov-hub .ov-media:not(.ov-media-fill)').evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => getComputedStyle(e).borderTopWidth),
    )
    expect(boxes.length).toBeGreaterThan(0)
    expect(new Set(boxes)).toEqual(new Set(['1px']))
    const circles = await page.locator('.ov-portraits .ov-avatar').evaluateAll((els) => els.map((e) => getComputedStyle(e).borderTopWidth))
    expect(circles.length).toBe(4)
    expect(new Set(circles)).toEqual(new Set(['1px']))

    // Placeholder text vs the box background (a no-map campaign shows the empty text).
    const contrast = (a: string, b: string) => {
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
    const caption = await page.locator('.ov-media-cap').first().evaluate((e) => ({
      fg: getComputedStyle(e).color,
      bg: getComputedStyle(e.closest('.ov-panel') as Element).backgroundColor,
    }))
    expect(contrast(caption.fg, caption.bg)).toBeGreaterThanOrEqual(4.5)
    const npc = await page.locator('.ov-npc-name').first().evaluate((e) => ({
      fg: getComputedStyle(e).color,
      bg: getComputedStyle(e.closest('.ov-panel') as Element).backgroundColor,
    }))
    expect(contrast(npc.fg, npc.bg)).toBeGreaterThanOrEqual(4.5)
  })
})
