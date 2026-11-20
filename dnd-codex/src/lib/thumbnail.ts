import { db } from '../db/db'
import { ThumbCache, previewSource } from './thumbnailCore'
import type { StoredPreviewSource, ThumbSize } from './thumbnailCore'

export { thumbSize, REUSE_BELOW_CHARS } from './thumbnailCore'

// Small preview images for the Overview hub cards (T-75).
//
// The `images` store holds each image's full base64 data URL and is indexed by
// campaignId only, so these helpers never list or scan it. They fetch ONE record by
// primary key, on demand, for an image a card is about to show. A stored image that
// is already small is shown as it is; a large one is shrunk once to the size the card
// needs (createImageBitmap resizes while decoding, so the full-size bitmap is not
// built) and the small result is kept in memory, so a card that re-renders or
// remounts does not read or decode the record again. There is no new store.
//
// What is cached, and when it is dropped:
//  - Only a ready preview is cached. A missing or failed image (for example a
//    battle map that so far exists only in cloud Storage) is looked up again the next
//    time, so it appears once the file has been downloaded into the local record.
//  - When an image record is updated or deleted through Dexie (in this tab, which
//    includes sync and the Battle Map page saving a downloaded file), its previews
//    are dropped. A load that was already running for that image does not cache.
//  - The cache is bounded by count and by total size (see ThumbCache).
//
// Nothing here touches the network. A battle-map image that exists only in cloud
// Storage (a `storagePath` with no local data URL) is reported as missing.

export type ThumbResult = { status: 'ready'; src: string } | { status: 'missing' }

const cache = new ThumbCache()
const inflight = new Map<string, Promise<ThumbResult>>()
/** Bumped when an image changes, so a load that started earlier does not cache stale data. */
const versions = new Map<string, number>()

const keyOf = (imageId: string, maxEdge: number) => `${imageId}|${maxEdge}`
const versionOf = (imageId: string) => versions.get(imageId) ?? 0

/** Forget everything held for one image. */
export function invalidateThumbnails(imageId: string): void {
  cache.dropImage(imageId)
  versions.set(imageId, versionOf(imageId) + 1)
  // A load already in flight for this image would resolve with the old data; drop it
  // so the next request starts a fresh one.
  for (const key of Array.from(inflight.keys())) if (key.startsWith(`${imageId}|`)) inflight.delete(key)
}

// Keep the cache honest when image records change through Dexie.
if (typeof indexedDB !== 'undefined') {
  const onUpdating = (_mods: object, primKey: unknown) => {
    invalidateThumbnails(String(primKey))
  }
  const onDeleting = (primKey: unknown) => {
    invalidateThumbnails(String(primKey))
  }
  db.images.hook('updating', onUpdating)
  db.images.hook('deleting', onDeleting)
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      db.images.hook('updating').unsubscribe(onUpdating)
      db.images.hook('deleting').unsubscribe(onDeleting)
    })
  }
}

/** The cached preview, if one has already been made. */
export function peekThumbnail(imageId: string, maxEdge: number): ThumbResult | undefined {
  const src = cache.get(keyOf(imageId, maxEdge))
  return src === undefined ? undefined : { status: 'ready', src }
}

function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob {
  const comma = dataUrl.indexOf(',')
  const head = dataUrl.slice(0, comma)
  const mime = /^data:([^;,]+)/.exec(head)?.[1] ?? fallbackMime
  const body = dataUrl.slice(comma + 1)
  if (/;base64/i.test(head)) {
    const binary = atob(body)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(body)], { type: mime }) // URL-encoded text
}

async function shrink(rec: StoredPreviewSource, size: ThumbSize): Promise<string> {
  const blob = dataUrlToBlob(rec.dataUrl, rec.mime ?? 'image/webp')
  let bitmap: ImageBitmap
  try {
    // Resizes while decoding, so the full-size bitmap is never built.
    bitmap = await createImageBitmap(blob, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'medium' })
  } catch {
    bitmap = await createImageBitmap(blob) // older browsers without the options: decode, then scale
  }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    const webp = canvas.toDataURL('image/webp', 0.72)
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.78)
  } finally {
    bitmap.close()
  }
}

async function load(imageId: string, maxEdge: number): Promise<ThumbResult> {
  const rec = await db.images.get(imageId) // one record by primary key, never the table
  if (!rec || !rec.dataUrl) return { status: 'missing' }
  return { status: 'ready', src: await previewSource(rec, maxEdge, shrink) }
}

/** Fetch (and shrink if needed) one image for a card. Rejects only on a database error. */
export function getThumbnail(imageId: string, maxEdge: number): Promise<ThumbResult> {
  const key = keyOf(imageId, maxEdge)
  const hit = cache.get(key)
  if (hit !== undefined) return Promise.resolve({ status: 'ready', src: hit })
  let pending = inflight.get(key)
  if (!pending) {
    const version = versionOf(imageId)
    const started: Promise<ThumbResult> = load(imageId, maxEdge)
      .then((r) => {
        // Cache a ready preview only, and only if the image did not change meanwhile.
        if (r.status === 'ready' && versionOf(imageId) === version) cache.set(key, r.src)
        return r
      })
      .finally(() => {
        if (inflight.get(key) === started) inflight.delete(key)
      })
    pending = started
    inflight.set(key, started)
  }
  return pending
}
