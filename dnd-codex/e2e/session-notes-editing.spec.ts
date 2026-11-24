import { test, expect } from './fixtures'

// Editing notes in the side panel during a session (demo, no sign-in): the player Notes tab
// and the DM Run Mode notes tab accept typing, keep the text through tab switches, full
// screen and reload, and never reach Supabase.

test.describe.configure({ timeout: 90000 })

test('demo player: Notes tab is editable and the text survives tab switches, full screen and reload', async ({ page, supabaseRequests }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Try the live demo' }).click()
  await expect(page.locator('.demo-banner')).toBeVisible()
  await page.getByTestId('demo-player-entry').click()
  await expect(page).toHaveURL(/#\/player\/demo-player-campaign-0001\/session/)

  await page.getByRole('tab', { name: /Notes/ }).click()
  const editor = page.locator('#pl-dock-body .ProseMirror')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.click()
  await page.keyboard.type('Thalia saw the cellar door.')
  await expect(page.getByTestId('notes-status')).toContainText(/Saving|Saved/)

  // Switch tabs immediately (inside the debounce) and come back.
  await page.getByRole('tab', { name: /Me/ }).click()
  await page.getByRole('tab', { name: /Notes/ }).click()
  await expect(editor).toContainText('Thalia saw the cellar door.')
  // Keep typing: the caret is at the end and nothing was lost.
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' Then a wolf howled.')
  await expect(page.getByTestId('notes-status')).toContainText('Saved')

  // Formatting works.
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ControlOrMeta+B')
  await expect(editor.locator('strong')).toContainText('Thalia saw')

  // Combat turn changes re-render the page without dropping the text or the focus.
  await page.getByTestId('demo-controls-toggle').click()
  await page.getByTestId('demo-start').click()
  await expect(page.getByTestId('top-round')).toContainText('Round 1')
  await page.getByRole('tab', { name: /Notes/ }).click()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' [x]')
  await page.getByTestId('demo-next').click()
  await page.getByTestId('demo-next').click()
  await expect(editor).toContainText('Then a wolf howled. [x]')
  await expect(page.getByTestId('notes-status')).toContainText('Saved')

  // Reload: the note is in the local demo database.
  await page.reload()
  await page.getByRole('tab', { name: /Notes/ }).click()
  await expect(page.locator('#pl-dock-body .ProseMirror')).toContainText('Then a wolf howled. [x]')

  // Full screen hosts the same panel: the text is there, and what you type there saves too.
  await page.getByRole('button', { name: 'Full screen' }).click()
  await page.getByTestId('player-dock').getByRole('tab', { name: /Notes/ }).click()
  const fsEditor = page.getByTestId('player-dock').locator('.ProseMirror')
  await expect(fsEditor).toContainText('Then a wolf howled. [x]')
  await fsEditor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' (full screen)')
  await page.getByRole('button', { name: 'Exit full screen' }).click()
  await page.getByRole('tab', { name: /Notes/ }).click()
  await expect(page.locator('#pl-dock-body .ProseMirror')).toContainText('(full screen)')

  expect(supabaseRequests, 'the demo must not send any request to the Supabase host').toEqual([])
})

test('demo DM: the Run Mode notes tab is a session notes editor that keeps its text', async ({ page, supabaseRequests }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Try the live demo' }).click()
  await expect(page.locator('.demo-banner')).toBeVisible()
  await page.goto('/#/run/demo-campaign-0001')
  await expect(page.locator('.tabletop-view')).toBeVisible({ timeout: 20000 })
  const panel = page.getByTestId('bm-inspector')
  await panel.getByRole('tab', { name: 'Notes', exact: true }).click()
  const editor = panel.locator('.ProseMirror').nth(1)
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.click()
  await page.keyboard.type('The party met Mordrek.')

  // Insert a timestamp / round marker with the quick-insert button.
  await panel.getByTestId('notes-stamp').click()
  await expect(editor).toContainText(/\d{1,2}:\d{2}/)

  // Leave the tab at once, come back, and the text is still there.
  await panel.getByRole('tab', { name: 'Combat', exact: true }).click()
  await panel.getByRole('tab', { name: 'Notes', exact: true }).click()
  await expect(panel.locator('.ProseMirror').nth(1)).toContainText('The party met Mordrek.')
  await expect(panel.getByTestId('notes-status')).toContainText('Saved')

  await page.reload()
  await page.getByTestId('bm-inspector').getByRole('tab', { name: 'Notes', exact: true }).click()
  await expect(page.getByTestId('bm-inspector').locator('.ProseMirror').nth(1)).toContainText('The party met Mordrek.')
  expect(supabaseRequests).toEqual([])
})
