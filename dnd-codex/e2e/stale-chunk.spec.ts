import { test, expect } from './fixtures'
import { isChunkLoadError } from '../src/lib/chunkError'

// T-58: a stale tab asks for a lazy chunk that a deploy removed, and the server
// answers with index.html. Safari words that as "'text/html' is not a valid
// JavaScript MIME type.", which the matcher used to miss.

test.describe('stale chunk matcher', () => {
  const messages = {
    'Safari MIME type': "'text/html' is not a valid JavaScript MIME type.",
    'Safari import failed': 'Importing a module script failed.',
    'Safari bare': 'Load failed',
    'Chrome fetch': 'Failed to fetch dynamically imported module: https://x.test/assets/a-1.js',
    'Chrome MIME type':
      'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
    'Firefox import': 'error loading dynamically imported module: https://x.test/assets/a-1.js',
    'Firefox MIME type': 'Loading module from "https://x.test/a.js" was blocked because of a disallowed MIME type ("text/html").',
  }
  for (const [name, msg] of Object.entries(messages)) {
    test(`matches ${name}`, () => expect(isChunkLoadError(msg)).toBe(true))
  }
  test('ignores an ordinary render error', () => {
    expect(isChunkLoadError("Cannot read properties of undefined (reading 'name')")).toBe(false)
  })
})

test.describe('stale chunk recovery', () => {
  test('reloads once, then shows the manual prompt instead of looping', async ({ page, supabaseRequests }) => {
    void supabaseRequests
    let chunkRequests = 0
    // Every request for the Roadmap route chunk gets index.html with a JS-less
    // MIME type, as a server does for a file a deploy removed.
    await page.route(/\/src\/pages\/RoadmapPage/, (route) => {
      chunkRequests++
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html></html>' })
    })
    await page.goto('/#/roadmap')
    await expect(page.getByText('Something went wrong loading this page.')).toBeVisible()
    // First failure reloaded the tab (second request); the second failure stayed put.
    expect(chunkRequests).toBe(2)
    await page.waitForTimeout(1500)
    expect(chunkRequests).toBe(2)
  })
})
