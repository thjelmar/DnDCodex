import { test, expect } from './fixtures'
import { test as logicTest, expect as logicExpect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { tokenImageId, withNpcImage, npcPortraitShared } from '../src/lib/npcTokenArt'
import { npcTokenIcon } from '../src/lib/tokenIcons'
import type { SceneToken } from '../src/db/types'

// T-131: a token linked to an NPC wears that NPC's uploaded image.

const npc = { name: 'Lord Mordrek', role: 'Warlord', race: 'Human', imageId: 'img-npc', tokenIcon: null, statBlockData: null, sharedWithPlayers: false, sharedSections: undefined as string[] | undefined }
const tok = (over: Partial<SceneToken> = {}): SceneToken => ({ id: 't1', label: 'Mordrek', color: '#f00', col: 1, row: 1, size: 1, npcId: 'n1', ...over })

logicTest.describe('token art precedence (pure logic)', () => {
  logicTest('the NPC image beats the automatic icon', () => {
    logicExpect(tokenImageId(tok(), npc)).toBe('img-npc')
    // The icon stamped at placement time is the automatic pick, not a choice.
    logicExpect(tokenImageId(tok({ tokenIcon: npcTokenIcon(npc) }), npc)).toBe('img-npc')
  })
  logicTest('a token image wins over the NPC image', () => {
    logicExpect(tokenImageId(tok({ imageId: 'img-own' }), npc)).toBe('img-own')
  })
  logicTest('an icon picked on the token, or on the NPC sheet, beats the NPC image', () => {
    logicExpect(tokenImageId(tok({ tokenIcon: 'dragon-head' }), npc)).toBeNull()
    logicExpect(tokenImageId(tok(), { ...npc, tokenIcon: 'dragon-head' })).toBeNull()
    logicExpect(tokenImageId(tok({ icon: '🐴' }), npc)).toBeNull()
  })
  logicTest('no NPC, or an NPC with no image, gives no image', () => {
    logicExpect(tokenImageId(tok({ npcId: null }), undefined)).toBeNull()
    logicExpect(tokenImageId(tok(), { ...npc, imageId: null })).toBeNull()
  })
  logicTest('players get the NPC image only when the NPC portrait is shared', () => {
    logicExpect(tokenImageId(tok(), npc, true)).toBeNull()
    logicExpect(tokenImageId(tok(), { ...npc, sharedWithPlayers: true }, true)).toBe('img-npc')
    logicExpect(tokenImageId(tok(), { ...npc, sharedWithPlayers: true, sharedSections: ['overview'] }, true)).toBeNull()
    logicExpect(npcPortraitShared({ sharedWithPlayers: true, sharedSections: ['portrait'] })).toBe(true)
    // A token's own image is the DM's deliberate choice, so players get it.
    logicExpect(tokenImageId(tok({ imageId: 'img-own' }), npc, true)).toBe('img-own')
  })
  logicTest('withNpcImage never changes the stored token', () => {
    const t = tok()
    const out = withNpcImage(t, npc)
    logicExpect(out.imageId).toBe('img-npc')
    logicExpect(t.imageId).toBeUndefined()
  })
})

// A 1x1 PNG, enough for the board to draw an <image>.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function openBoard(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto('/#/campaign/demo-campaign-0001/battlemap')
  await page.locator('.battlemap-maps .list-row').first().click()
  await expect(page.getByTestId('bm-studio')).toBeVisible()
}

const mordrek = (page: Page) => page.locator('.tabletop-token', { hasText: 'Mordrek' }).first()

async function patchVillain(page: Page, patch: { imageUpload?: boolean; tokenIcon?: string | null }): Promise<void> {
  await page.evaluate(async ({ patch, png }) => {
    const { db } = await import('/src/db/db.ts')
    const n = await db.npcs.where('name').equals('Lord Mordrek').first()
    if (!n) throw new Error('demo NPC missing')
    const update: Record<string, unknown> = {}
    if (patch.imageUpload) {
      const id = 'e2e-npc-img'
      await db.images.put({ id, campaignId: n.campaignId, name: 'e2e.png', mime: 'image/png', dataUrl: png, width: 1, height: 1, bytes: 100, createdAt: '', updatedAt: '' } as never)
      update.imageId = id
    }
    if ('tokenIcon' in patch) update.tokenIcon = patch.tokenIcon
    await db.npcs.update(n.id, update)
  }, { patch, png: PNG })
}

test.describe('NPC image on the battle map token', () => {
  test('the token shows the NPC image, and an icon picked on the NPC sheet wins', async ({ page }) => {
    await openBoard(page)
    await expect(mordrek(page)).toBeVisible()
    await expect(mordrek(page).locator('image')).toHaveCount(0)

    await patchVillain(page, { imageUpload: true })
    await expect(mordrek(page).locator('image')).toHaveCount(1)
    await expect(mordrek(page).locator('image')).toHaveAttribute('href', /^data:image\//)
    // The token record keeps no copy: the image follows the NPC.
    const stored = await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts')
      const s = (await db.scenes.toArray()).flatMap((x) => x.tokens).find((t) => t.label === 'Mordrek')
      return s?.imageId ?? null
    })
    expect(stored).toBeNull()

    await patchVillain(page, { tokenIcon: 'dragon-head' })
    await expect(mordrek(page).locator('image')).toHaveCount(0)
    await patchVillain(page, { tokenIcon: null })
    await expect(mordrek(page).locator('image')).toHaveCount(1)
  })
})
