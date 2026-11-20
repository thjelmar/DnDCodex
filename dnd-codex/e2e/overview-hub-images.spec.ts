import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { thumbSize, REUSE_BELOW_CHARS, previewSource, ThumbCache } from '../src/lib/thumbnailCore'
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

/**
 * Wait for the four hub cards. The Overview has an intermittent first-load crash in the
 * World overview editor (T-71: "Cannot read properties of null (reading 'cached')"), which
 * replaces the page with "Something went wrong loading this page." If that shows, reload
 * (up to twice, and say so in the output) rather than fail a test that is about pictures.
 * Remove this when T-71 is fixed.
 */
async function expectCards(page: Page): Promise<void> {
  const cards = page.locator('.ov-hubcard')
  const crashed = page.getByText('Something went wrong loading this page.')
  const wait = (loc: ReturnType<Page['locator']>, state: 'attached' | 'visible', tag: string) =>
    loc.first().waitFor({ state, timeout: 20_000 }).then(() => tag).catch(() => 'none')
  for (let attempt = 0; attempt < 3; attempt++) {
    const outcome = await Promise.race([wait(cards, 'attached', 'cards'), wait(crashed, 'visible', 'crash')])
    if (outcome === 'cards') break
    if (outcome === 'crash' && attempt < 2) {
      console.warn('T-71: the Overview crashed on load; reloading')
      await page.reload()
      continue
    }
    break
  }
  await expect(cards).toHaveCount(4)
  // The pictures load when their card scrolls into view. The World overview now sits
  // above the cards (T-86), so on a wide screen bring the cards on screen first.
  const width = page.viewportSize()?.width ?? 0
  if (width >= 961) await page.locator('.ov-hub').evaluate((el) => el.scrollIntoView({ block: 'start' }))
}

async function openDemo(page: Page, theme?: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(INSTRUMENT)
  await page.addInitScript((t) => {
    sessionStorage.setItem('codex-demo', '1')
    if (t) localStorage.setItem('codex.theme', t)
  }, theme ?? null)
  await page.goto(DEMO_PATH)
  await expectCards(page)
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
  await expectCards(page)
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

test.describe('thumbnail cache and preview source (logic)', () => {
  const big = (n: number) => 'x'.repeat(n)

  test('the cache is bounded by entry count, least recently used first', () => {
    const c = new ThumbCache(3, 1_000_000, 1_000_000)
    for (const k of ['a|1', 'b|1', 'c|1']) c.set(k, big(10))
    c.get('a|1') // touch: now b is the oldest
    c.set('d|1', big(10))
    expect(c.size).toBe(3)
    expect(c.get('b|1')).toBeUndefined()
    expect(c.get('a|1')).toBeDefined()
  })

  test('the cache is bounded by total characters, and skips one oversize entry', () => {
    const c = new ThumbCache(100, 100, 60)
    c.set('a|1', big(50))
    c.set('b|1', big(50))
    expect(c.chars).toBe(100)
    c.set('c|1', big(50)) // over the total: the oldest goes
    expect(c.get('a|1')).toBeUndefined()
    expect(c.chars).toBeLessThanOrEqual(100)
    c.set('huge|1', big(61)) // over the per-entry limit: not kept at all
    expect(c.get('huge|1')).toBeUndefined()
    expect(c.chars).toBeLessThanOrEqual(100)
  })

  test('dropImage removes every size of one image and leaves the others', () => {
    const c = new ThumbCache()
    c.set('img-1|96', 'a')
    c.set('img-1|640', 'bb')
    c.set('img-10|96', 'ccc')
    c.set('img-2|96', 'dddd')
    c.dropImage('img-1')
    expect(c.get('img-1|96')).toBeUndefined()
    expect(c.get('img-1|640')).toBeUndefined()
    expect(c.get('img-10|96')).toBe('ccc') // a different id that merely starts the same
    expect(c.get('img-2|96')).toBe('dddd')
    expect(c.chars).toBe('ccc'.length + 'dddd'.length)
  })

  test('replacing a key updates the running total instead of double counting', () => {
    const c = new ThumbCache()
    c.set('a|1', big(10))
    c.set('a|1', big(4))
    expect(c.size).toBe(1)
    expect(c.chars).toBe(4)
  })

  const png = (chars: number) => ({ dataUrl: 'data:image/png;base64,' + big(chars), mime: 'image/png', width: 1600, height: 900 })

  test('previewSource shows small images, SVG and already-small images as they are, without shrinking', async () => {
    let calls = 0
    const spy = async () => {
      calls++
      return 'data:image/webp;base64,small'
    }
    const small = { ...png(1000) }
    expect(await previewSource(small, 640, spy)).toBe(small.dataUrl)
    const tiny = { ...png(REUSE_BELOW_CHARS + 10_000), width: 300, height: 200 } // large text, but already small in pixels
    expect(await previewSource(tiny, 640, spy)).toBe(tiny.dataUrl)
    expect(calls).toBe(0)
  })

  test('a large SVG (URL-encoded or base64, with or without a mime) is shown as it is and never shrunk', async () => {
    let calls = 0
    const spy = async () => {
      calls++
      throw new Error('should not be called')
    }
    const svgText = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600">' + '<rect width="10" height="10"/>'.repeat(1500) + '</svg>'
    const encoded = { dataUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(svgText), mime: 'image/svg+xml', width: 1200, height: 600 }
    const b64 = { dataUrl: 'data:image/svg+xml;base64,' + btoa(svgText), width: 1200, height: 600 } // no mime field
    expect(encoded.dataUrl.length).toBeGreaterThan(REUSE_BELOW_CHARS)
    expect(b64.dataUrl.length).toBeGreaterThan(REUSE_BELOW_CHARS)
    expect(await previewSource(encoded, 640, spy)).toBe(encoded.dataUrl)
    expect(await previewSource(b64, 640, spy)).toBe(b64.dataUrl)
    expect(calls).toBe(0)
  })

  test('when shrinking fails, or is not smaller, the original is shown', async () => {
    const rec = png(REUSE_BELOW_CHARS + 20_000)
    expect(await previewSource(rec, 640, async () => { throw new Error('cannot decode') })).toBe(rec.dataUrl)
    expect(await previewSource(rec, 640, async () => big(rec.dataUrl.length + 5))).toBe(rec.dataUrl)
    expect(await previewSource(rec, 640, async () => 'data:image/webp;base64,tiny')).toBe('data:image/webp;base64,tiny')
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
    await expectCards(page)

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
    await expectCards(page)
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
    await expectCards(page)

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
      await expectCards(page)
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


// ---- review fixes: images that change, SVG, and the icon chunk ------------------

/** A small solid-colour PNG as a data URL, drawn in the page. */
const makePng = (page: Page, color: string, size = 40) =>
  page.evaluate(
    ([c, n]) => {
      const cv = document.createElement('canvas')
      cv.width = n as number
      cv.height = n as number
      const x = cv.getContext('2d')!
      x.fillStyle = c as string
      x.fillRect(0, 0, n as number, n as number)
      return cv.toDataURL('image/png')
    },
    [color, size],
  )

/** Write rows into the demo database with raw IndexedDB (no Dexie hooks fire), then reload. */
async function putRows(
  page: Page,
  rows: { images?: object[]; npcs?: Record<string, string | null>; sceneImageId?: string | null; tokenImageId?: string | null },
) {
  await page.evaluate(async (r) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const q = indexedDB.open('dnd-codex-demo')
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    const tx = db.transaction(['images', 'npcs', 'scenes'], 'readwrite')
    for (const row of r.images ?? []) tx.objectStore('images').put(row)
    const patch = (store: string, key: string, fn: (v: Record<string, unknown>) => Record<string, unknown>) => {
      const os = tx.objectStore(store)
      const g = os.get(key)
      g.onsuccess = () => os.put(fn(g.result))
    }
    for (const [id, imageId] of Object.entries(r.npcs ?? {})) patch('npcs', id, (v) => ({ ...v, imageId }))
    if (r.sceneImageId !== undefined || r.tokenImageId !== undefined) {
      patch('scenes', 'demo-scene-stag', (v) => ({
        ...v,
        ...(r.sceneImageId !== undefined ? { imageId: r.sceneImageId } : {}),
        ...(r.tokenImageId !== undefined
          ? { tokens: (v.tokens as Array<Record<string, unknown>>).map((t) => ({ ...t, imageId: r.tokenImageId })) }
          : {}),
      }))
    }
    await new Promise<void>((res) => (tx.oncomplete = () => res()))
    db.close()
  }, rows)
  await page.reload()
  await expectCards(page)
}

const imgRow = (id: string, dataUrl: string, w = 40, h = 40, extra: object = {}) => ({
  id,
  campaignId: CID,
  name: `${id}.png`,
  mime: dataUrl.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png',
  dataUrl,
  width: w,
  height: h,
  bytes: Math.round(dataUrl.length * 0.75),
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  ...extra,
})

/** Run code against the app's own Dexie instance (the same module the page uses), so its
 *  hooks and live queries fire exactly as they would for a real edit. */
const withAppDb = <T,>(page: Page, body: string): Promise<T> =>
  page.evaluate(async (code) => {
    const { db } = await (0, eval)("import('/src/db/db.ts')")
    return await new Function('db', `return (async () => { ${code} })()`)(db)
  }, body)

const goAwayAndBack = async (page: Page) => {
  await page.evaluate((cid) => (location.hash = `#/campaign/${cid}/npcs`), CID)
  await expect(page).toHaveURL(/\/npcs$/)
  // The NPCs page is a lazy chunk: the Overview stays on screen until it has loaded. Wait
  // until the Overview is really gone (unmounted), so coming back remounts the cards.
  await expect(page.locator('.ov-hubcard')).toHaveCount(0)
  await page.evaluate((cid) => (location.hash = `#/campaign/${cid}`), CID)
  await expectCards(page)
}

const battleImg = (page: Page) => card(page, 'Run').locator('.ov-battle img')
const battleSrc = (page: Page) => battleImg(page).evaluate((i: HTMLImageElement) => i.src)

test.describe('images that change while the page is open (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('a cloud-only map shows the placeholder, then the image once it is in the local record', async ({ page }) => {
    await openDemo(page)
    await putRows(page, { images: [imgRow('late-1', '', 800, 600, { storagePath: 'battlemaps/late.png' })], sceneImageId: 'late-1' })
    await expect(card(page, 'Run').locator('.ov-battle')).toContainText('Map image not available on this device')
    await expect(battleImg(page)).toHaveCount(0)

    // The Battle Map page downloads the file into the same record (a Dexie write).
    const png = await makePng(page, '#3366cc')
    await withAppDb(page, `await db.images.update('late-1', { dataUrl: ${JSON.stringify(png)} })`)
    await goAwayAndBack(page) // the card remounts; the earlier "missing" was not remembered
    await expect(battleImg(page)).toBeVisible()
    await expect(card(page, 'Run').locator('.ov-battle')).not.toContainText('not available')
    expect(await battleSrc(page)).toBe(png)
  })

  test('an image replaced in place under the same id is shown after the card remounts', async ({ page }) => {
    await openDemo(page)
    const red = await makePng(page, '#cc2233')
    const green = await makePng(page, '#22aa44')
    await putRows(page, { images: [imgRow('same-1', red)], sceneImageId: 'same-1' })
    await expect(battleImg(page)).toBeVisible()
    expect(await battleSrc(page)).toBe(red) // now cached

    await withAppDb(page, `await db.images.update('same-1', { dataUrl: ${JSON.stringify(green)} })`)
    await goAwayAndBack(page)
    await expect(battleImg(page)).toBeVisible()
    expect(await battleSrc(page)).toBe(green) // the update dropped the cached preview
  })

  test('changing the scene to another image swaps the preview; the old picture never shows for the new id', async ({ page }) => {
    await openDemo(page)
    const red = await makePng(page, '#cc2233')
    // A large noisy image takes a moment to decode and shrink: the window in which a stale
    // picture would stay on screen if the old one were kept while the new one loads.
    const bigBlue = await page.evaluate(() => {
      const cv = document.createElement('canvas')
      cv.width = 1800
      cv.height = 1000
      const x = cv.getContext('2d')!
      x.fillStyle = '#2244cc'
      x.fillRect(0, 0, 1800, 1000)
      for (let i = 0; i < 1800; i++) {
        x.fillStyle = `rgb(${(Math.random() * 255) | 0},${(Math.random() * 255) | 0},${(Math.random() * 255) | 0})`
        x.fillRect(Math.random() * 1800, Math.random() * 1000, 30, 30)
      }
      return cv.toDataURL('image/png')
    })
    await putRows(page, { images: [imgRow('swap-a', red), imgRow('swap-b', bigBlue, 1800, 1000)], sceneImageId: 'swap-a' })
    await expect(battleImg(page)).toBeVisible()
    expect(await battleSrc(page)).toBe(red)

    // Sample every frame after the change: no frame may show the old picture under the new id.
    const stale = await page.evaluate(async (oldSrc) => {
      const { db } = await (0, eval)("import('/src/db/db.ts')")
      await db.scenes.update('demo-scene-stag', { imageId: 'swap-b' })
      const frames: string[] = []
      const t0 = performance.now()
      while (performance.now() - t0 < 2500) {
        await new Promise((r) => requestAnimationFrame(r))
        const box = document.querySelector('.ov-media-battle') as HTMLElement | null
        const img = box?.querySelector('img') as HTMLImageElement | null
        if (box?.dataset.imageId === 'swap-b' && img && img.src === oldSrc) frames.push('stale')
        if (box?.dataset.imageId === 'swap-b' && img && img.src !== oldSrc && img.complete) break
      }
      return frames.length
    }, red)
    expect(stale, 'frames that showed the old picture for the new image id').toBe(0)
    await expect.poll(async () => (await battleSrc(page)) !== red).toBe(true)
    expect((await battleImg(page).evaluate((i: HTMLImageElement) => i.naturalWidth))).toBeLessThanOrEqual(640)

    // To an id with no record: the picture is gone at once and the placeholder shows.
    await withAppDb(page, `await db.scenes.update('demo-scene-stag', { imageId: 'swap-nope' })`)
    await expect(battleImg(page)).toHaveCount(0)
    await expect(card(page, 'Run').locator('.ov-battle')).toContainText('Map image not available on this device')
  })

  test('a large SVG is shown as it is (not shrunk, not a placeholder)', async ({ page }) => {
    await openDemo(page)
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600"><rect width="1200" height="600" fill="#445"/>' +
      '<circle cx="30" cy="30" r="8" fill="#fc0"/>'.repeat(1200) +
      '</svg>'
    const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
    expect(dataUrl.length).toBeGreaterThan(REUSE_BELOW_CHARS)
    await putRows(page, { images: [imgRow('svg-1', dataUrl, 1200, 600)], sceneImageId: 'svg-1' })
    await expect(battleImg(page)).toBeVisible()
    await expect.poll(() => battleImg(page).evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    expect(await battleSrc(page)).toBe(dataUrl)
  })
})

test.describe('avatar fallbacks and the icon chunk (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('when every NPC and token has a portrait, the icon chunk is never downloaded', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (r) => requested.push(r.url()))
    await openDemo(page)
    const png = await makePng(page, '#7744cc')
    await putRows(page, {
      images: [imgRow('all-portrait', png)],
      npcs: { 'demo-npc-king': 'all-portrait', 'demo-npc-rogue': 'all-portrait', 'demo-npc-villain': 'all-portrait', 'demo-npc-innkeep': 'all-portrait' },
      tokenImageId: 'all-portrait',
    })
    requested.length = 0
    await page.reload()
    await expectCards(page)
    await expect(card(page, 'World & Lore').locator('.ov-npc img')).toHaveCount(4)
    await expect(card(page, 'Run').locator('.ov-token img')).toHaveCount(4)
    await page.waitForTimeout(800)
    expect(requested.filter((u) => /tokenIconPaths/.test(u))).toEqual([])
    await expect(page.locator('.ov-hub .ov-avatar-face svg')).toHaveCount(0)
  })

  test('an avatar whose image fails shows its glyph; one with no image id shows its glyph too', async ({ page }) => {
    await openDemo(page)
    const png = await makePng(page, '#7744cc')
    await putRows(page, {
      images: [imgRow('ok-1', png), imgRow('bad-1', 'data:image/png;base64,AAAA')],
      npcs: { 'demo-npc-innkeep': 'ok-1', 'demo-npc-rogue': 'bad-1' },
    })
    const world = card(page, 'World & Lore')
    await expect(world.locator('.ov-npc', { hasText: 'Bram' }).locator('img')).toBeVisible()
    await expect(world.locator('.ov-npc', { hasText: 'Sable' }).locator('svg')).toBeVisible() // failed: glyph
    await expect(world.locator('.ov-npc', { hasText: 'Mordrek' }).locator('svg')).toBeVisible() // no image id: glyph
  })
})
