import { lazy, type ComponentType } from 'react'
import { isChunkLoadError } from './chunkError'

// Waits (ms) before each retry of a failed chunk import: two retries, so three
// attempts in all.
export const CHUNK_RETRY_DELAYS = [400, 1200]

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Runs a dynamic import and retries it when it fails with a chunk-load error.
 * Other errors (a real bug in the module) rethrow at once. After the last retry
 * the error propagates to the route boundary, which still does T-58's one-time
 * page reload and then shows the error page.
 */
export async function retryImport<T>(load: () => Promise<T>, delays: number[] = CHUNK_RETRY_DELAYS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await load()
    } catch (err) {
      if (attempt >= delays.length || !isChunkLoadError(String((err as Error)?.message || err))) throw err
      await wait(delays[attempt])
    }
  }
}

/** `React.lazy` that retries a transient chunk failure before giving up. */
export function lazyWithRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => retryImport(load))
}
