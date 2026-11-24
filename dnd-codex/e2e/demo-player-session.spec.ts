import { test, expect } from './fixtures'

// The demo player's faux live session (lib/demoLive.ts): the real player UI, wired to an
// in-memory fake. Walks the player side end to end and proves the demo never reaches Supabase.

test('demo player: empty state through combat and End turn, with no Supabase request', async ({ page, supabaseRequests }) => {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Try the live demo' }).click()
  await expect(page.locator('.demo-banner')).toBeVisible()

  // The entry point on Home opens the player session.
  await page.getByTestId('demo-player-entry').click()
  await expect(page).toHaveURL(/#\/player\/demo-player-campaign-0001\/session/)
  await expect(page.getByTestId('demo-controls')).toBeVisible()
  await expect(page.locator('.session-header')).toContainText('Live')

  // The tabletop shows the demo map with tokens.
  await expect(page.locator('.session-vtt')).toBeVisible()

  // Initiative starts empty.
  await page.getByRole('tab', { name: /Initiative/ }).click()
  await expect(page.getByTestId('initiative-empty')).toBeVisible()

  // The DM asks for initiative; the player joins with the demo character.
  await page.getByTestId('demo-ask').click()
  await expect(page.getByTestId('initiative-strip')).toBeVisible()
  await page.getByTestId('join-initiative').click()
  await expect(page.getByRole('dialog', { name: 'Join initiative' })).toContainText('Thalia')
  await page.getByTestId('join-submit').click()
  await expect(page.getByTestId('strip-chip').filter({ hasText: 'Thalia' })).toBeVisible()

  // The DM starts combat: enemies appear with a marker slot but no HP numbers.
  await page.getByTestId('demo-start').click()
  await expect(page.getByTestId('top-round')).toContainText('Round 1')
  await expect(page.getByTestId('dock-row').filter({ hasText: 'Goblin Boss' })).toBeVisible()
  await expect(page.getByTestId('dock-row').filter({ hasText: 'Goblin Boss' }).getByTestId('dock-hp')).toHaveCount(0)

  // Pass turns with the DM control until it is Thalia's turn.
  for (let i = 0; i < 6 && !(await page.getByTestId('your-turn').isVisible()); i++) {
    await page.getByTestId('demo-next').click()
  }
  await expect(page.getByTestId('your-turn')).toContainText('Thalia')

  // End turn advances the order, and the banner goes away.
  await page.getByTestId('end-turn').click()
  await expect(page.getByTestId('your-turn')).toHaveCount(0, { timeout: 5000 })

  // The Me tab shows the character's HP; Notes and Handouts open.
  await page.getByRole('tab', { name: /Me/ }).click()
  await expect(page.getByTestId('me-hp')).toContainText('22/22')
  await page.getByRole('tab', { name: /Handouts/ }).click()
  await expect(page.locator('#pl-dock-body img')).toBeVisible()
  await page.getByRole('tab', { name: /Notes/ }).click()
  await expect(page.locator('#pl-dock-body .ProseMirror')).toBeVisible()

  // Reset returns to the empty state.
  await page.getByTestId('demo-reset').click()
  await page.getByRole('tab', { name: /Initiative/ }).click()
  await expect(page.getByTestId('initiative-empty')).toBeVisible()

  expect(supabaseRequests, 'the demo must not send any request to the Supabase host').toEqual([])
})

test('demo has no Supabase client at all', async ({ page }) => {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Try the live demo' }).click()
  await expect(page.locator('.demo-banner')).toBeVisible()
  // Realtime opens a WebSocket and auth keeps a token in localStorage; neither may exist.
  const found = await page.evaluate(`Object.keys(localStorage).filter((k) => k.startsWith('sb-')).length`)
  expect(found).toBe(0)
})

test('demo DM: Run mode combat tools work with nothing signed in', async ({ page, supabaseRequests }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto('/#/run/demo-campaign-0001')
  await expect(page.locator('.tabletop-view')).toBeVisible()
  const panel = page.getByTestId('bm-inspector')
  await panel.getByRole('tab', { name: 'Scene', exact: true }).click()
  await panel.getByRole('button', { name: 'Add Mordrek to initiative' }).click()
  await panel.getByRole('tab', { name: 'Combat', exact: true }).click()
  await expect(page.getByTestId('il-row')).toHaveCount(1)
  // "Ask players for initiative" is offered before combat starts.
  await panel.getByRole('button', { name: 'More combat actions' }).click()
  // The upward menu overlaps the top bar at this size, so dispatch the click.
  await page.getByTestId('ask-players').dispatchEvent('click')
  await page.getByTestId('bm-turns').getByRole('button', { name: 'Start combat' }).click()
  await expect(page.getByRole('button', { name: /^Next/ })).toHaveCount(1)
  expect(supabaseRequests).toEqual([])
})
