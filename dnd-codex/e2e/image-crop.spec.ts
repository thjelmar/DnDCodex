import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { deflateSync } from 'node:zlib'

// Image crop on upload (T-113 item 2): picking a portrait opens a pan-and-zoom dialog, and the
// saved image is the visible part. Local only (IndexedDB, no account) at desktop and phone size.
// The demo blocks image writes, so these tests use a real local campaign.


/** A 400x200 PNG: left half red, right half blue. */
function twoTonepng(): Buffer {
  const w = 400
  const h = 200
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1)
    for (let x = 0; x < w; x++) {
      const o = row + 1 + x * 3
      if (x < w / 2) raw[o] = 255
      else raw[o + 2] = 255
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (b: Buffer) => {
    let c = 0xffffffff
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Colour of the left and right edge pixels of the saved portrait. */
async function edgeColors(page: Page) {
  return page.locator('img.entity-image-img').evaluate(async (el) => {
    const img = el as HTMLImageElement
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const px = (x: number) => Array.from(ctx.getImageData(x, Math.floor(c.height / 2), 1, 1).data)
    return { left: px(2), right: px(c.width - 3), w: c.width, h: c.height }
  })
}

async function openDialog(page: Page) {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start a campaign' }).click()
  await page.getByPlaceholder('Curse of the Shattered Crown').fill(`Crop ${Date.now()}`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
  const cid = new URL(page.url()).hash.split('/')[2]
  await page.goto(`/#/campaign/${cid}/npcs`)
  await page.getByRole('button', { name: 'New NPC' }).first().click()
  await page.locator('.entity-image-empty').first().waitFor()
  await page.locator('.entity-image input[type=file]').first().setInputFiles({
    name: 'two-tone.png',
    mimeType: 'image/png',
    buffer: twoTonepng(),
  })
  await expect(page.getByTestId('crop-frame')).toBeVisible()
  await expect(page.locator('.crop-img')).toBeVisible()
}

for (const [name, viewport] of [
  ['desktop', { width: 1280, height: 800 }],
  ['phone', { width: 390, height: 664 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: name === 'phone' })

    test('Save stores the centred crop by default', async ({ page }) => {
      await openDialog(page)
      await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.locator('img.entity-image-img')).toBeVisible()
      const e = await edgeColors(page)
      expect(e.left[0]).toBeGreaterThan(200) // red on the left
      expect(e.right[2]).toBeGreaterThan(200) // blue on the right
      expect(Math.abs(e.w / e.h - 132 / 156)).toBeLessThan(0.02) // matches the frame
    })

    test('dragging moves the crop, and the Save button is reachable', async ({ page }) => {
      await openDialog(page)
      const box = (await page.getByTestId('crop-frame').boundingBox())!
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx + 120, cy, { steps: 6 })
      await page.mouse.up()
      await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click()
      const e = await edgeColors(page)
      expect(e.left[0]).toBeGreaterThan(200)
      expect(e.right[0]).toBeGreaterThan(200) // both edges red: showed the left side
      expect(e.right[2]).toBeLessThan(60)
    })

    test('the zoom slider narrows the visible area', async ({ page }) => {
      await openDialog(page)
      const before = await page.locator('.crop-img').boundingBox()
      await page.getByLabel('Zoom').fill('2')
      const after = await page.locator('.crop-img').boundingBox()
      expect(after!.width).toBeGreaterThan(before!.width * 1.9)
      await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.locator('img.entity-image-img')).toBeVisible()
    })

    test('the token preview follows the crop', async ({ page }) => {
      await openDialog(page)
      const preview = page.getByTestId('crop-token-preview')
      await expect(preview).toBeVisible()
      const box = (await preview.boundingBox())!
      expect(box.width).toBeLessThan(80)
      const imgX = () => preview.locator('image').getAttribute('x')
      const before = await imgX()
      const f = (await page.getByTestId('crop-frame').boundingBox())!
      await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2)
      await page.mouse.down()
      await page.mouse.move(f.x + f.width / 2 + 60, f.y + f.height / 2, { steps: 5 })
      await page.mouse.up()
      expect(await imgX()).not.toBe(before)
      // Fully visible inside the modal on this viewport.
      const vp = page.viewportSize()!
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width)
    })

    test('Cancel stores nothing', async ({ page }) => {
      await openDialog(page)
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByTestId('crop-frame')).toHaveCount(0)
      await expect(page.locator('img.entity-image-img')).toHaveCount(0)
    })
  })
}
