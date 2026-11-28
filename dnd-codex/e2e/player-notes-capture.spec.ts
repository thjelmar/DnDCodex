import { test, expect } from './fixtures'

// Player note taking in the live session (T-124): the Notes tab has a quick-capture bar that adds
// typed, labeled cards to the session note, a labeled toolbar, and no DM-only spoiler lock.

test.describe.configure({ timeout: 90000 })

async function openDemoPlayerNotes(page: import('@playwright/test').Page) {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Try the live demo' }).click()
  await expect(page.locator('.demo-banner')).toBeVisible()
  await page.getByTestId('demo-player-entry').click()
  await expect(page).toHaveURL(/#\/player\/demo-player-campaign-0001\/session/)
  await page.getByRole('tab', { name: /Notes/ }).click()
}

test('demo player: quick capture adds typed cards, stamps the round, and keeps them', async ({ page, supabaseRequests }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openDemoPlayerNotes(page)
  const editor = page.locator('#pl-dock-body .ProseMirror')
  const capture = page.getByTestId('capture-input')
  await expect(capture).toBeEnabled()

  // A leading character picks the type.
  await capture.fill('!Frost-rune key')
  await page.getByTestId('capture-add').click()
  await expect(editor.locator('.note-card.nc-loot')).toHaveAttribute('data-label', 'Loot')
  await expect(editor.locator('.note-card.nc-loot')).toContainText('Frost-rune key')
  await expect(capture).toHaveValue('')

  // A chip picks it too, and Enter adds. The newest card sits on top.
  await page.getByTestId('capture-chip-ask').click()
  await capture.fill('Who ordered the seal?')
  await capture.press('Enter')
  await expect(editor.locator('.note-card').first()).toHaveClass(/nc-ask/)
  await expect(editor.locator('.note-card')).toHaveCount(2)

  // During combat the card carries the round.
  await page.getByTestId('demo-controls-toggle').click()
  await page.getByTestId('demo-start').click()
  await expect(page.getByTestId('top-round')).toContainText('Round 1')
  await page.getByRole('tab', { name: /Notes/ }).click()
  await capture.fill('@Old Tam, ferryman')
  await page.getByTestId('capture-add').click()
  await expect(editor.locator('.note-card.nc-npc')).toHaveAttribute('data-label', 'NPC · Round 1')

  // Free typing still works beside the cards, and everything saves.
  await editor.locator('p').last().click()
  await page.keyboard.type('Mira holds the gate.')
  await expect(page.getByTestId('notes-status')).toContainText('Saved')

  await page.reload()
  await page.getByRole('tab', { name: /Notes/ }).click()
  const after = page.locator('#pl-dock-body .ProseMirror')
  await expect(after.locator('.note-card')).toHaveCount(3)
  await expect(after).toContainText('Mira holds the gate.')
  await expect(after.locator('.note-card.nc-npc')).toHaveAttribute('data-label', 'NPC · Round 1')

  expect(supabaseRequests, 'the demo must not send any request to the Supabase host').toEqual([])
})

test('demo player: an untyped capture is plain text, not a card', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openDemoPlayerNotes(page)
  const editor = page.locator('#pl-dock-body .ProseMirror')
  const capture = page.getByTestId('capture-input')
  await expect(capture).toBeEnabled()
  await capture.fill('Ambush')
  await capture.press('Enter')
  await expect(editor).toContainText('Ambush')
  await expect(editor.locator('.note-card')).toHaveCount(0)
  // A typed one still becomes a card, above the plain text.
  await capture.fill('!Frost-rune key')
  await capture.press('Enter')
  await expect(editor.locator('.note-card.nc-loot')).toHaveCount(1)
  await expect(editor.locator('.note-card')).toHaveCount(1)
})

test('demo player: the toolbar is labeled and has no spoiler lock', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openDemoPlayerNotes(page)
  const toolbar = page.locator('#pl-dock-body').getByRole('toolbar', { name: 'Formatting' })
  await expect(toolbar).toBeVisible()
  for (const name of ['Bold', 'Italic', 'Heading', 'List', 'Quote', 'Link', 'Image']) {
    await expect(toolbar.getByRole('button', { name })).toBeVisible()
  }
  await expect(toolbar.locator('[title^="Spoiler"]')).toHaveCount(0)
  // A labeled button works: Bold wraps the typed text.
  const editor = page.locator('#pl-dock-body .ProseMirror')
  await editor.click()
  await page.keyboard.type('Careful')
  await page.keyboard.press('ControlOrMeta+A')
  await toolbar.getByRole('button', { name: 'Bold' }).click()
  await expect(editor.locator('strong')).toContainText('Careful')
})

test('phone: capture and keep typing with the toolbar reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await openDemoPlayerNotes(page)
  await page.getByTestId('capture-input').fill('?Where does the tunnel lead')
  await page.getByTestId('capture-add').click()
  await expect(page.locator('#pl-dock-body .note-card.nc-ask')).toBeVisible()
  const box = await page.locator('#pl-dock-body .note-capture').boundingBox()
  expect(box && box.x >= 0 && box.x + box.width <= 390, 'the capture bar fits the phone width').toBe(true)
})

test('phone: every panel tab shows its name, so Notes is easy to find', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await openDemoPlayerNotes(page)
  const tabs = page.locator('.pl-panel .bm-tabs')
  for (const name of ['Initiative', 'Me', 'Notes', 'Handouts']) {
    await expect(tabs.locator('.bm-tab-label', { hasText: new RegExp(`^${name}$`) })).toBeVisible()
  }
  // Nothing is cut off at the right edge.
  const last = await tabs.getByRole('tab', { name: 'Handouts' }).boundingBox()
  expect(last && last.x + last.width <= 390, 'the last tab fits the phone width').toBe(true)
})
