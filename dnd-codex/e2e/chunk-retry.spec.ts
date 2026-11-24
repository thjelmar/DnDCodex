import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { retryImport } from '../src/lib/lazyWithRetry'

// A lazy route chunk that fails transiently (a one-off CDN 500) must not show the error
// page: lazyWithRetry re-imports it. If it keeps failing, T-58's reload and then the error
// page still apply. Runs in Chromium and WebKit (Safari's wording is "Importing a module
// script failed"). In dev the chunk URL is the source file, so we intercept that.

const CHUNK = /\/src\/pages\/PlayerSessionPage\.tsx/

async function openPlayerSession(page: Page) {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Try the live demo' }).click()
  await expect(page.locator('.demo-banner')).toBeVisible()
  await page.getByTestId('demo-player-entry').click()
}

test('a lazy chunk that fails twice then recovers loads without the error page', async ({ page }) => {
  let hits = 0
  await page.route(CHUNK, (route) => {
    hits += 1
    return hits <= 2 ? route.fulfill({ status: 500, body: 'edge error' }) : route.continue()
  })
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Try the live demo' }).click()
  await expect(page.locator('.demo-banner')).toBeVisible()
  await page.waitForTimeout(1500) // entering the demo reloads the page once; let that settle
  // The marker dies with the document, so it proves the retry worked without a page reload.
  await page.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true })
  await page.getByTestId('demo-player-entry').click()
  await expect(page.getByTestId('demo-controls')).toBeVisible({ timeout: 15_000 })
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
  await expect(page.locator('.route-error')).toHaveCount(0)
  expect(hits).toBeGreaterThanOrEqual(3)
})

test('a lazy chunk that always fails ends on the error page with Reload', async ({ page }) => {
  await page.route(CHUNK, (route) => route.fulfill({ status: 500, body: 'edge error' }))
  await openPlayerSession(page)
  await expect(page.locator('.route-error')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Something went wrong loading this page.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
})

test.describe('retryImport', () => {
  const chunkErr = () => new TypeError('Importing a module script failed.')
  test('retries a chunk-load error, then resolves', async () => {
    let calls = 0
    const value = await retryImport(async () => { if (++calls < 3) throw chunkErr(); return 'ok' }, [1, 1])
    expect(value).toBe('ok')
    expect(calls).toBe(3)
  })
  test('gives up after the last retry and rethrows', async () => {
    let calls = 0
    await expect(retryImport(async () => { calls++; throw chunkErr() }, [1, 1])).rejects.toThrow('module script')
    expect(calls).toBe(3)
  })
  test('does not retry an ordinary error', async () => {
    let calls = 0
    await expect(retryImport(async () => { calls++; throw new Error('boom') }, [1, 1])).rejects.toThrow('boom')
    expect(calls).toBe(1)
  })
})
