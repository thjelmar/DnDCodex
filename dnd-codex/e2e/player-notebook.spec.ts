import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// The player's notebook on the campaign Notes page (T-124): a searchable list, the open entry beside
// it (full screen with a back button on a phone), links and backlinks, and typed note cards.

test.describe.configure({ timeout: 90000 })

const CID = 'nb-camp'
const T = '2026-11-27T12:00:00Z'
const note = (o: Record<string, unknown>) => ({ tags: [], date: '', status: '', body: '', createdAt: T, updatedAt: T, campaignId: CID, ...o })

async function seed(page: Page) {
  await page.goto('/')
  await page.waitForFunction(async () => (await indexedDB.databases()).some((d) => d.name === 'dnd-codex'))
  await page.evaluate(
    async ([cid, t]) => {
      const mk = (o: Record<string, unknown>) => ({ tags: [], date: '', status: '', body: '', createdAt: t, updatedAt: t, campaignId: cid, ...o })
      const rows = [
        mk({
          id: 'n-journal', section: 'journal', title: 'Session 7: The Frozen Gate', date: '2026-11-27', tags: ['ice-gate'],
          body: '<p>We reached the gate. <a data-wikilink="Captain Mira" class="wikilink">Captain Mira</a> told us the east wing is sealed.</p>' +
            '<div data-note-card="loot" data-round="3">Frost-rune key</div><div data-note-card="ask">Who ordered the seal?</div>',
        }),
        mk({ id: 'n-mira', section: 'people', title: 'Captain Mira', body: '<p>Gate warden. Owes us a favor.</p>' }),
        mk({ id: 'n-quest', section: 'quests', title: 'Find the missing caravan', status: 'active', body: '<p>Last seen on the Salt Road.</p>' }),
      ]
      await new Promise<void>((res, rej) => {
        const r = indexedDB.open('dnd-codex')
        r.onerror = () => rej(r.error)
        r.onsuccess = () => {
          const tx = r.result.transaction(['campaigns', 'playerNotes'], 'readwrite')
          tx.objectStore('campaigns').put({ id: cid, name: 'Frozen City', role: 'player', createdAt: t, updatedAt: t })
          for (const n of rows) tx.objectStore('playerNotes').put(n)
          tx.oncomplete = () => res()
          tx.onerror = () => rej(tx.error)
        }
      })
    },
    [CID, T],
  )
  await page.goto(`/#/player/${CID}`)
  await expect(page.getByTestId('notebook')).toBeVisible()
}
void note

const items = (page: Page) => page.getByTestId('nb-item')

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the list groups entries, searches by name, filters by section', async ({ page }) => {
    await seed(page)
    await expect(items(page)).toHaveCount(3)
    await expect(page.getByTestId('nb-group-journal')).toContainText('Session 7: The Frozen Gate')
    // A live note shows its card counts instead of its first words.
    await expect(page.getByTestId('nb-group-journal')).toContainText('1 Loot · 1 Ask DM')
    await expect(page.getByTestId('nb-empty')).toBeVisible()

    await page.getByTestId('nb-search').fill('caravan')
    await expect(items(page)).toHaveCount(1)
    await expect(items(page)).toContainText('Find the missing caravan')
    // A leading @ is ignored, so "@mira" finds the NPC and the session that mentions her.
    await page.getByTestId('nb-search').fill('@mira')
    await expect(items(page)).toHaveCount(2)
    await page.getByTestId('nb-search').fill('zzz')
    await expect(page.getByTestId('nb-none')).toContainText('No notes match')

    await page.getByTestId('nb-search').fill('')
    await page.getByRole('button', { name: /^Quests/ }).click()
    await expect(items(page)).toHaveCount(1)
    await page.getByRole('button', { name: /^Quests/ }).click()
    await expect(items(page)).toHaveCount(3)
  })

  test('open an entry: typed cards, labeled toolbar, links and backlinks', async ({ page }) => {
    await seed(page)
    await items(page).filter({ hasText: 'Session 7' }).click()
    const entry = page.getByTestId('nb-entry')
    await expect(entry.getByLabel('Title')).toHaveValue('Session 7: The Frozen Gate')
    await expect(entry.locator('.note-card.nc-loot')).toHaveAttribute('data-label', 'Loot · Round 3')
    await expect(entry.locator('.note-card.nc-ask')).toHaveAttribute('data-label', 'Ask DM')
    await expect(entry.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Link' })).toBeVisible()
    await expect(entry.locator('[title^="Spoiler"]')).toHaveCount(0)

    const side = page.getByTestId('nb-side')
    await expect(side.getByRole('button', { name: 'Captain Mira' })).toBeVisible()
    await side.getByRole('button', { name: 'Captain Mira' }).click()
    await expect(page.getByTestId('nb-entry').getByLabel('Title')).toHaveValue('Captain Mira')
    // Mira's page lists the session that links to her.
    await expect(page.getByTestId('nb-side').getByRole('button', { name: 'Session 7: The Frozen Gate' })).toBeVisible()
  })

  test('New adds an entry, it autosaves, survives a reload, and can be deleted', async ({ page }) => {
    await seed(page)
    await page.getByTestId('nb-new').click()
    await page.getByTestId('nb-new-quests').click()
    const entry = page.getByTestId('nb-entry')
    await entry.getByLabel('Title').fill('Free the ferryman')
    await entry.locator('.ProseMirror').click()
    await page.keyboard.type('He is held at the east dock.')
    await expect(page.getByTestId('notes-status')).toContainText('Saved')
    await entry.getByLabel('Status').selectOption('completed')
    await expect(page.getByTestId('notes-status')).toContainText('Saved')

    await page.reload()
    await expect(items(page)).toHaveCount(4)
    await items(page).filter({ hasText: 'Free the ferryman' }).click()
    await expect(page.getByTestId('nb-entry').locator('.ProseMirror')).toContainText('He is held at the east dock.')
    await expect(page.getByTestId('nb-entry').getByLabel('Status')).toHaveValue('completed')

    await page.getByTestId('nb-entry').getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(items(page)).toHaveCount(3)
    await expect(page.getByTestId('nb-empty')).toBeVisible()
  })

  test('?sel= opens that entry (the live Notes tab links here)', async ({ page }) => {
    await seed(page)
    await page.goto(`/#/player/${CID}?sel=n-mira`)
    await expect(page.getByTestId('nb-entry').getByLabel('Title')).toHaveValue('Captain Mira')
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 780 } })

  test('list first, then the entry full screen with a back button', async ({ page }) => {
    await seed(page)
    await expect(items(page)).toHaveCount(3)
    await expect(page.getByTestId('nb-empty')).toBeHidden()
    await items(page).filter({ hasText: 'Find the missing caravan' }).click()
    await expect(page.getByTestId('nb-entry')).toBeVisible()
    await expect(items(page).first()).toBeHidden()
    // Typing works and the toolbar buttons are icon-only but named.
    await page.getByTestId('nb-entry').locator('.ProseMirror').click()
    await page.keyboard.type(' Reward: 200 gp.')
    await expect(page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Bold' })).toBeVisible()
    await expect(page.getByTestId('notes-status')).toContainText('Saved')
    const box = await page.getByTestId('notebook').boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= 390, 'the notebook fits the phone width').toBe(true)

    await page.getByRole('button', { name: 'Back to notes' }).click()
    await expect(items(page)).toHaveCount(3)
    await expect(page.getByTestId('nb-entry')).toBeHidden()
  })
})

test.describe('new entry on a short screen', () => {
  test.use({ viewport: { width: 1280, height: 640 } })

  test('New scrolls the notebook into view so the body editor is visible', async ({ page }) => {
    await seed(page)
    await page.getByTestId('nb-new').scrollIntoViewIfNeeded()
    await page.getByTestId('nb-new').click()
    await page.getByTestId('nb-new-journal').click()
    const body = page.getByTestId('nb-entry').locator('.ProseMirror')
    await expect(body).toBeInViewport({ ratio: 0.5 })
  })
})
